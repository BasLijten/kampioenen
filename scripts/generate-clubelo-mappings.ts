/**
 * Generate and validate a reviewable ClubElo mapping artifact.
 *
 * Example:
 *   npm run generate-clubelo-mappings -- --source source.json --clubelo clubelo.json \
 *     --output data/eredivisie/clubelo-mapping.json --competition eredivisie \
 *     --season 2026/27 --scope current
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createClubEloMappingDocument,
  diffClubEloMappings,
  generateClubEloMappings,
  mergeLockedMappings,
  validateClubEloMappings,
  type ClubEloAlias,
  type ClubEloClub,
  type ClubEloMappingDocument,
  type MappingDiffEntry,
  type EligibleFixture,
  type MappingScopeKind,
  type SourceClub,
} from "../lib/clubelo-mapping";

interface CliOptions {
  sourcePath: string;
  clubEloPath: string;
  aliasesPath?: string;
  fixturesPath?: string;
  existingPath?: string;
  outputPath: string;
  reportPath: string;
  diffPath: string;
  competitionId: string;
  season: string;
  scopeKind: MappingScopeKind;
  requireApproved: boolean;
}

function usage(): string {
  return [
    "Usage: npm run generate-clubelo-mappings -- --source <path> --clubelo <path>",
    "  --output <path>       mapping artifact to write",
    "  --competition <id>    competition identifier",
    "  --season <season>     season identifier",
    "  --scope <current|historical>",
    "  --aliases <path>      optional JSON array of explicit aliases",
    "  --fixtures <path>     eligible historical fixtures (required for historical scope)",
    "  --existing <path>     optional prior artifact containing locked mappings",
    "  --report <path>       validation report (default: <output>.validation.json)",
    "  --diff <path>         generated diff (default: <output>.diff.json)",
    "  --require-approved    validate for production; fail unless every mapping is approved",
    "  --production          alias for --require-approved",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  let requireApproved = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-approved" || argument === "--production") {
      requireApproved = true;
      continue;
    }
    if (!argument.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    values.set(argument.slice(2), argv[index + 1]);
    index += 1;
  }

  const sourcePath = values.get("source");
  const clubEloPath = values.get("clubelo");
  const outputPath = values.get("output");
  const competitionId = values.get("competition");
  const season = values.get("season");
  const scopeKind = values.get("scope") as MappingScopeKind | undefined;
  if (!sourcePath || !clubEloPath || !outputPath || !competitionId || !season || !scopeKind) {
    throw new Error(`Missing required arguments.\n${usage()}`);
  }
  if (scopeKind !== "current" && scopeKind !== "historical") {
    throw new Error(`--scope must be current or historical`);
  }
  if (scopeKind === "historical" && !values.get("fixtures")) {
    throw new Error("--fixtures is required for historical scope");
  }

  return {
    sourcePath,
    clubEloPath,
    aliasesPath: values.get("aliases"),
    fixturesPath: values.get("fixtures"),
    existingPath: values.get("existing"),
    outputPath,
    reportPath: values.get("report") ?? `${outputPath}.validation.json`,
    diffPath: values.get("diff") ?? `${outputPath}.diff.json`,
    competitionId,
    season,
    scopeKind,
    requireApproved,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

function arrayFromJson(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, unknown>)[key] as unknown[];
  }
  throw new Error(`${key} input must be an array or an object with a ${key} array`);
}

function sourceClubs(value: unknown): SourceClub[] {
  return arrayFromJson(value, "clubs").map((item) => {
    if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).id !== "string" || typeof (item as Record<string, unknown>).name !== "string") {
      throw new Error("source clubs require string id and name fields");
    }
    const record = item as Record<string, unknown>;
    return { id: record.id as string, name: record.name as string };
  });
}

function clubEloClubs(value: unknown): ClubEloClub[] {
  return arrayFromJson(value, "clubs").map((item) => {
    if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).slug !== "string" || typeof (item as Record<string, unknown>).name !== "string") {
      throw new Error("ClubElo clubs require string slug and name fields");
    }
    const record = item as Record<string, unknown>;
    return { slug: record.slug as string, name: record.name as string };
  });
}

function aliases(value: unknown): ClubEloAlias[] {
  return arrayFromJson(value, "aliases").map((item) => {
    if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).alias !== "string" || typeof (item as Record<string, unknown>).clubEloSlug !== "string") {
      throw new Error("aliases require string alias and clubEloSlug fields");
    }
    const record = item as Record<string, unknown>;
    const sourceId = record.sourceId;
    if (sourceId !== undefined && typeof sourceId !== "string") {
      throw new Error("alias sourceId must be a string when provided");
    }
    return {
      sourceId: sourceId as string | undefined,
      alias: record.alias as string,
      clubEloSlug: record.clubEloSlug as string,
    };
  });
}

function eligibleFixtures(value: unknown): EligibleFixture[] {
  return arrayFromJson(value, "fixtures").map((item) => {
    if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).homeSourceId !== "string" || typeof (item as Record<string, unknown>).awaySourceId !== "string") {
      throw new Error("eligible fixtures require string homeSourceId and awaySourceId fields");
    }
    const record = item as Record<string, unknown>;
    return { homeSourceId: record.homeSourceId as string, awaySourceId: record.awaySourceId as string };
  });
}

function readExistingMappings(path: string | undefined): ClubEloMappingDocument | undefined {
  if (!path || !existsSync(resolve(path))) return undefined;
  const document = readJson(path) as Partial<ClubEloMappingDocument>;
  if (!Array.isArray(document.mappings)) throw new Error("existing mapping artifact has no mappings array");
  return document as ClubEloMappingDocument;
}

function writeJson(path: string, value: unknown): void {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function generateMappingArtifact(options: CliOptions): {
  document: ClubEloMappingDocument;
  report: ReturnType<typeof validateClubEloMappings>;
  diff: MappingDiffEntry[];
} {
  const source = sourceClubs(readJson(options.sourcePath));
  const clubElo = clubEloClubs(readJson(options.clubEloPath));
  const explicitAliases = options.aliasesPath ? aliases(readJson(options.aliasesPath)) : [];
  const fixtures = options.fixturesPath ? eligibleFixtures(readJson(options.fixturesPath)) : undefined;
  const generatedAt = new Date().toISOString();
  const scope = {
    competitionId: options.competitionId,
    season: options.season,
    kind: options.scopeKind,
  } as const;
  const generated = generateClubEloMappings(source, clubElo, explicitAliases, { scope, generatedAt });
  const existing = readExistingMappings(options.existingPath ?? options.outputPath);
  const mappings = mergeLockedMappings(generated, existing?.mappings ?? []);
  const document = createClubEloMappingDocument(mappings, generatedAt);
  const diff = diffClubEloMappings(existing?.mappings ?? [], mappings);
  const report = validateClubEloMappings(mappings, source, {
    scope,
    aliases: explicitAliases,
    eligibleFixtures: fixtures,
    requireApproved: options.requireApproved,
  });
  return { document, report, diff };
}

export function main(argv = process.argv.slice(2)): void {
  try {
    const options = parseArgs(argv);
    const { document, report, diff } = generateMappingArtifact(options);
    writeJson(options.reportPath, report);
    writeJson(options.diffPath, diff);
    console.log(`Wrote ${options.reportPath}`);
    console.log(`Wrote ${options.diffPath}`);
    console.log(`Coverage: ${(report.coverage.ratio * 100).toFixed(1)}% (required ${(report.coverage.required * 100).toFixed(1)}%)`);
    if (options.requireApproved && !report.productionReady) {
      console.error("Production validation failed; mapping artifact was not written.");
      process.exitCode = 1;
      return;
    }
    writeJson(options.outputPath, document);
    console.log(`Wrote ${options.outputPath}`);
    if (report.errors.length > 0) {
      console.error(`Validation failed with ${report.errors.length} error(s).`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("generate-clubelo-mappings.ts")) {
  main();
}
