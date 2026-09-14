import { createHash } from "node:crypto";

export const CLUB_ELO_MAPPING_GENERATOR_VERSION = "clubelo-mapping-v1";

export type MappingScopeKind = "current" | "historical";
export type MappingMatchMethod = "exact" | "alias" | "fuzzy" | "manual" | "unresolved";
export type MappingStatus = "proposed" | "approved" | "rejected" | "unresolved";

export interface MappingScope {
  competitionId: string;
  season: string;
  kind: MappingScopeKind;
}

export interface SourceClub {
  id: string;
  name: string;
}

export interface ClubEloClub {
  slug: string;
  name: string;
}

/** An alias is deliberately explicit: it is never inferred from historical names. */
export interface ClubEloAlias {
  sourceId?: string;
  alias: string;
  clubEloSlug: string;
}

export interface MappingCandidate {
  clubEloSlug: string;
  clubEloName: string;
  confidence: number;
  matchMethod: "exact" | "alias" | "fuzzy";
}

export interface ClubEloMapping {
  sourceId: string;
  sourceName: string;
  clubEloSlug: string | null;
  scope: MappingScope;
  confidence: number;
  matchMethod: MappingMatchMethod;
  status: MappingStatus;
  locked: boolean;
  candidates: MappingCandidate[];
  generatorVersion: string;
  generatedAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  changeReason?: string;
}

export interface MappingGenerationOptions {
  scope: MappingScope;
  generatedAt?: string;
  generatorVersion?: string;
  fuzzyCandidateThreshold?: number;
}

export interface EligibleFixture {
  homeSourceId: string;
  awaySourceId: string;
}

export interface MappingValidationOptions {
  scope: MappingScope;
  aliases?: ClubEloAlias[];
  eligibleFixtures?: EligibleFixture[];
  minimumConfidence?: number;
  requireApproved?: boolean;
}

export type MappingValidationErrorCode =
  | "missing-mapping"
  | "unknown-source"
  | "duplicate-source"
  | "duplicate-clubelo-slug"
  | "scope-mismatch"
  | "unresolved-mapping"
  | "low-confidence"
  | "unapproved-mapping"
  | "coverage-below-threshold"
  | "conflicting-alias";

export interface MappingValidationError {
  code: MappingValidationErrorCode;
  message: string;
  sourceId?: string;
  clubEloSlug?: string;
}

export interface MappingCoverage {
  eligible: number;
  mapped: number;
  ratio: number;
  required: number;
}

export interface MappingValidationReport {
  valid: boolean;
  productionReady: boolean;
  scope: MappingScope;
  coverage: MappingCoverage;
  errors: MappingValidationError[];
}

export interface MappingDiffEntry {
  sourceId: string;
  change: "added" | "changed" | "removed";
  before: ClubEloMapping | null;
  after: ClubEloMapping | null;
}

export interface ClubEloMappingDocument {
  schemaVersion: 1;
  artifactId?: string;
  generatorVersion: string;
  generatedAt: string;
  scope: MappingScope;
  mappings: ClubEloMapping[];
}

export interface ApprovalMetadata {
  reviewer: string;
  approvedAt: string;
  clubEloSlug?: string;
  manual?: boolean;
  reason?: string;
}

export interface StatusChangeMetadata {
  changedAt: string;
  reason?: string;
}

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeClubName(value: string): string {
  return normalizeForMatching(value);
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;

    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + cost
      );
      diagonal = above;
    }
  }

  return previous[b.length];
}

function fuzzyConfidence(sourceName: string, candidateName: string): number {
  const source = normalizeForMatching(sourceName);
  const candidate = normalizeForMatching(candidateName);
  if (!source || !candidate) return 0;

  const editSimilarity = 1 - levenshteinDistance(source, candidate) / Math.max(source.length, candidate.length);
  const sourceTokens = new Set(source.split(" "));
  const candidateTokens = candidate.split(" ");
  const tokenCoverage = candidateTokens.filter((token) => sourceTokens.has(token)).length / candidateTokens.length;

  // A ClubElo name is often a short form of the provider name (for example
  // "PSV" versus "PSV Eindhoven"). Treat complete token containment as a
  // meaningful signal without turning it into an exact match.
  if (tokenCoverage === 1 && candidateTokens.length < sourceTokens.size) {
    return roundConfidence(0.65 + editSimilarity * 0.35);
  }

  return roundConfidence(editSimilarity * 0.7 + tokenCoverage * 0.3);
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function scopeKey(scope: MappingScope): string {
  return `${scope.competitionId}:${scope.season}:${scope.kind}`;
}

function mappingKey(mapping: ClubEloMapping): string {
  return `${scopeKey(mapping.scope)}:${mapping.sourceId}`;
}

function aliasMatchesSource(alias: ClubEloAlias, source: SourceClub): boolean {
  return alias.sourceId === source.id || normalizeForMatching(alias.alias) === normalizeForMatching(source.name);
}

function conflictingAliasSlugs(aliases: ClubEloAlias[]): Set<string> {
  const targets = new Map<string, Set<string>>();
  for (const alias of aliases) {
    const key = normalizeForMatching(alias.alias);
    const slugs = targets.get(key) ?? new Set<string>();
    slugs.add(alias.clubEloSlug);
    targets.set(key, slugs);
  }

  return new Set(
    Array.from(targets.values())
      .filter((slugs) => slugs.size > 1)
      .flatMap((slugs) => Array.from(slugs))
  );
}

function sortCandidates(candidates: MappingCandidate[]): MappingCandidate[] {
  return [...candidates].sort(
    (a, b) => b.confidence - a.confidence || a.clubEloSlug.localeCompare(b.clubEloSlug)
  );
}

export function generateClubEloMappings(
  sourceClubs: SourceClub[],
  clubEloClubs: ClubEloClub[],
  aliases: ClubEloAlias[] = [],
  options: MappingGenerationOptions
): ClubEloMapping[] {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const generatorVersion = options.generatorVersion ?? CLUB_ELO_MAPPING_GENERATOR_VERSION;
  const fuzzyThreshold = options.fuzzyCandidateThreshold ?? 0.55;
  const conflictingSlugs = conflictingAliasSlugs(aliases);

  return [...sourceClubs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((source) => {
      const matchingAliases = aliases.filter((alias) => aliasMatchesSource(alias, source));
      const aliasSlugs = new Set(matchingAliases.map((alias) => alias.clubEloSlug));
      const usableAliasSlugs = Array.from(aliasSlugs).filter((slug) => !conflictingSlugs.has(slug));
      const aliasCandidates = usableAliasSlugs.flatMap((slug) => {
        const club = clubEloClubs.find((candidate) => candidate.slug === slug);
        return club
          ? [{ clubEloSlug: club.slug, clubEloName: club.name, confidence: 0.99, matchMethod: "alias" as const }]
          : [];
      });

      const exactCandidates = clubEloClubs
        .filter((club) => normalizeForMatching(club.name) === normalizeForMatching(source.name))
        .map((club) => ({
          clubEloSlug: club.slug,
          clubEloName: club.name,
          confidence: 1,
          matchMethod: "exact" as const,
        }));

      const fuzzyCandidates = clubEloClubs
        .map((club) => ({
          clubEloSlug: club.slug,
          clubEloName: club.name,
          confidence: fuzzyConfidence(source.name, club.name),
          matchMethod: "fuzzy" as const,
        }))
        .filter((candidate) => candidate.confidence >= fuzzyThreshold);

      const candidates = sortCandidates(
        aliasCandidates.length > 0
          ? aliasCandidates
          : exactCandidates.length > 0
            ? exactCandidates
            : fuzzyCandidates
      );
      const top = candidates[0];
      const second = candidates[1];
      const isAmbiguous = Boolean(top && second && top.confidence === second.confidence);
      const isConflictingAlias = matchingAliases.length > 0 && usableAliasSlugs.length === 0;

      let match: Pick<ClubEloMapping, "clubEloSlug" | "confidence" | "matchMethod" | "status" | "changeReason">;
      if (isConflictingAlias || isAmbiguous || !top) {
        match = {
          clubEloSlug: null,
          confidence: 0,
          matchMethod: "unresolved",
          status: "unresolved",
          changeReason: isConflictingAlias
            ? "conflicting aliases require manual resolution"
            : isAmbiguous
              ? "fuzzy candidates are equally strong"
              : "no plausible ClubElo candidate",
        };
      } else {
        match = {
          clubEloSlug: top.clubEloSlug,
          confidence: top.confidence,
          matchMethod: top.matchMethod,
          status: "proposed",
        };
      }

      return {
        sourceId: source.id,
        sourceName: source.name,
        ...match,
        scope: options.scope,
        locked: false,
        candidates,
        generatorVersion,
        generatedAt,
        updatedAt: generatedAt,
      };
    });
}

function mappingForSource(mappings: ClubEloMapping[], sourceId: string): ClubEloMapping[] {
  return mappings.filter((mapping) => mapping.sourceId === sourceId);
}

function addError(
  errors: MappingValidationError[],
  error: MappingValidationError
): void {
  if (!errors.some((existing) =>
    existing.code === error.code &&
    existing.sourceId === error.sourceId &&
    existing.clubEloSlug === error.clubEloSlug
  )) {
    errors.push(error);
  }
}

export function validateClubEloMappings(
  mappings: ClubEloMapping[],
  sourceClubs: SourceClub[],
  options: MappingValidationOptions
): MappingValidationReport {
  const errors: MappingValidationError[] = [];
  const minimumConfidence = options.minimumConfidence ?? 0.8;
  const requireApproved = options.requireApproved ?? false;
  const sourceIds = new Set(sourceClubs.map((source) => source.id));
  const sourceCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();

  for (const mapping of mappings) {
    sourceCounts.set(mapping.sourceId, (sourceCounts.get(mapping.sourceId) ?? 0) + 1);
    if (mapping.clubEloSlug) {
      slugCounts.set(mapping.clubEloSlug, (slugCounts.get(mapping.clubEloSlug) ?? 0) + 1);
    }
    if (!sourceIds.has(mapping.sourceId)) {
      addError(errors, {
        code: "unknown-source",
        sourceId: mapping.sourceId,
        message: `Mapping refers to unknown source club ${mapping.sourceId}.`,
      });
    }
    if (scopeKey(mapping.scope) !== scopeKey(options.scope)) {
      addError(errors, {
        code: "scope-mismatch",
        sourceId: mapping.sourceId,
        message: `Mapping for ${mapping.sourceId} belongs to a different scope.`,
      });
    }
  }

  for (const source of sourceClubs) {
    const sourceMappings = mappingForSource(mappings, source.id);
    if (sourceMappings.length === 0) {
      addError(errors, {
        code: "missing-mapping",
        sourceId: source.id,
        message: `No ClubElo mapping exists for ${source.name}.`,
      });
    }
  }

  for (const [sourceId, count] of sourceCounts) {
    if (count > 1) {
      addError(errors, {
        code: "duplicate-source",
        sourceId,
        message: `Source club ${sourceId} has multiple mappings.`,
      });
    }
  }

  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      addError(errors, {
        code: "duplicate-clubelo-slug",
        clubEloSlug: slug,
        message: `ClubElo slug ${slug} is assigned more than once in this scope.`,
      });
    }
  }

  for (const mapping of mappings) {
    if (!mapping.clubEloSlug || mapping.matchMethod === "unresolved" || mapping.status === "unresolved") {
      addError(errors, {
        code: "unresolved-mapping",
        sourceId: mapping.sourceId,
        message: `Club ${mapping.sourceName} has no resolved ClubElo mapping.`,
      });
    }
    if (mapping.confidence < minimumConfidence) {
      addError(errors, {
        code: "low-confidence",
        sourceId: mapping.sourceId,
        message: `Club ${mapping.sourceName} has confidence ${mapping.confidence}, below ${minimumConfidence}.`,
      });
    }
    if (requireApproved && mapping.status !== "approved") {
      addError(errors, {
        code: "unapproved-mapping",
        sourceId: mapping.sourceId,
        message: `Club ${mapping.sourceName} is not approved for production use.`,
      });
    }
  }

  const required = options.scope.kind === "current" ? 1 : 0.95;
  const eligibleFixtures = options.eligibleFixtures;
  const eligible = eligibleFixtures ? eligibleFixtures.length : sourceClubs.length;
  const mappedSlugs = new Map(
    mappings
      .filter((mapping) => mapping.clubEloSlug)
      .map((mapping) => [mapping.sourceId, mapping.clubEloSlug as string])
  );
  const mapped = eligibleFixtures
    ? eligibleFixtures.filter((fixture) =>
      mappedSlugs.has(fixture.homeSourceId) && mappedSlugs.has(fixture.awaySourceId)
    ).length
    : sourceClubs.filter((source) => mappedSlugs.has(source.id)).length;
  const ratio = eligible === 0 ? 1 : mapped / eligible;

  if (ratio < required) {
    addError(errors, {
      code: "coverage-below-threshold",
      message: `Mapping coverage ${(ratio * 100).toFixed(1)}% is below the required ${(required * 100).toFixed(1)}%.`,
    });
  }

  for (const conflictingSlug of conflictingAliasSlugs(options.aliases ?? [])) {
    addError(errors, {
      code: "conflicting-alias",
      clubEloSlug: conflictingSlug,
      message: `An explicit alias resolves to multiple ClubElo slugs, including ${conflictingSlug}.`,
    });
  }

  const productionReady = errors.length === 0 && mappings.length > 0 && mappings.every((mapping) => mapping.status === "approved");
  return {
    valid: errors.length === 0,
    productionReady,
    scope: options.scope,
    coverage: { eligible, mapped, ratio, required },
    errors,
  };
}

export function approveMapping(mapping: ClubEloMapping, metadata: ApprovalMetadata): ClubEloMapping {
  if (mapping.locked) throw new Error("locked mappings cannot change");
  if (!metadata.reviewer || !metadata.approvedAt) {
    throw new Error("approval metadata requires reviewer and approvedAt");
  }

  const slug = metadata.clubEloSlug ?? mapping.clubEloSlug;
  if (!slug) throw new Error("approved mappings require a ClubElo slug");
  const isManual = metadata.manual === true || slug !== mapping.clubEloSlug;

  return {
    ...mapping,
    clubEloSlug: slug,
    confidence: isManual ? 1 : mapping.confidence,
    matchMethod: isManual ? "manual" : mapping.matchMethod,
    status: "approved",
    locked: isManual,
    updatedAt: metadata.approvedAt,
    approvedAt: metadata.approvedAt,
    approvedBy: metadata.reviewer,
    changeReason: metadata.reason ?? mapping.changeReason,
  };
}

/**
 * The production boundary is intentionally explicit. Proposal artifacts may
 * contain unresolved or unapproved entries, but a caller cannot accidentally
 * pass those entries into a production prediction run.
 */
export function approvedMappingsForProduction(
  mappings: ClubEloMapping[],
  sourceClubs: SourceClub[],
  options: MappingValidationOptions
): ClubEloMapping[] {
  const report = validateClubEloMappings(mappings, sourceClubs, {
    ...options,
    requireApproved: true,
  });
  if (!report.productionReady) {
    throw new Error(`ClubElo mappings are not production-ready: ${report.errors.map((error) => error.code).join(", ")}`);
  }
  return mappings.map((mapping) => ({ ...mapping }));
}

const allowedTransitions: Record<MappingStatus, MappingStatus[]> = {
  proposed: ["rejected", "approved"],
  unresolved: ["proposed", "rejected"],
  rejected: ["proposed"],
  approved: [],
};

export function transitionMappingStatus(
  mapping: ClubEloMapping,
  nextStatus: MappingStatus,
  metadata: StatusChangeMetadata
): ClubEloMapping {
  if (mapping.locked) throw new Error("locked mappings cannot change");
  if (nextStatus === "approved") {
    throw new Error("approved mappings require approval metadata");
  }
  if (!allowedTransitions[mapping.status].includes(nextStatus)) {
    throw new Error(`cannot transition mapping from ${mapping.status} to ${nextStatus}`);
  }

  return {
    ...mapping,
    status: nextStatus,
    updatedAt: metadata.changedAt,
    changeReason: metadata.reason ?? mapping.changeReason,
  };
}

export function mergeLockedMappings(
  generatedMappings: ClubEloMapping[],
  existingMappings: ClubEloMapping[]
): ClubEloMapping[] {
  const locks = new Map(
    existingMappings
      .filter((mapping) => mapping.locked)
      .map((mapping) => [mappingKey(mapping), mapping])
  );

  return generatedMappings.map((mapping) =>
    locks.get(mappingKey(mapping)) ?? mapping
  );
}

export function diffClubEloMappings(
  previousMappings: ClubEloMapping[],
  currentMappings: ClubEloMapping[]
): MappingDiffEntry[] {
  const previous = new Map(previousMappings.map((mapping) => [mappingKey(mapping), mapping]));
  const current = new Map(currentMappings.map((mapping) => [mappingKey(mapping), mapping]));
  const keys = new Set([...previous.keys(), ...current.keys()]);
  const comparableMapping = (mapping: ClubEloMapping): string =>
    JSON.stringify({ ...mapping, generatedAt: undefined, updatedAt: undefined });

  return Array.from(keys)
    .sort()
    .flatMap((mappingKey): MappingDiffEntry[] => {
      const before = previous.get(mappingKey) ?? null;
      const after = current.get(mappingKey) ?? null;
      if (!before && after) return [{ sourceId: after.sourceId, change: "added", before, after }];
      if (before && !after) return [{ sourceId: before.sourceId, change: "removed", before, after }];
      if (!before || !after) return [];
      if (comparableMapping(before) === comparableMapping(after)) return [];
      return [{ sourceId: after.sourceId, change: "changed", before, after }];
    });
}

export function createClubEloMappingDocument(
  mappings: ClubEloMapping[],
  generatedAt = new Date().toISOString()
): ClubEloMappingDocument {
  const scope = mappings[0]?.scope;
  if (!scope || mappings.some((mapping) => scopeKey(mapping.scope) !== scopeKey(scope))) {
    throw new Error("mapping document requires mappings from one scope");
  }

  const artifactValue = JSON.stringify({ scope, mappings });
  const artifactId = `clubelo-mapping-${createHash("sha256").update(artifactValue).digest("hex").slice(0, 16)}`;
  return {
    schemaVersion: 1,
    artifactId,
    generatorVersion: mappings[0].generatorVersion,
    generatedAt,
    scope,
    mappings,
  };
}
