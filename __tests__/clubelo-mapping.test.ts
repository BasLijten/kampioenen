import { describe, expect, it } from "vitest";
import {
  approveMapping,
  approvedMappingsForProduction,
  diffClubEloMappings,
  generateClubEloMappings,
  mergeLockedMappings,
  transitionMappingStatus,
  validateClubEloMappings,
  type ClubEloMapping,
  type ClubEloClub,
  type MappingScope,
  type SourceClub,
} from "../lib/clubelo-mapping";

const scope: MappingScope = {
  competitionId: "eredivisie",
  season: "2026/27",
  kind: "current",
};

const sourceClubs: SourceClub[] = [
  { id: "1", name: "PSV Eindhoven" },
  { id: "2", name: "AFC Ajax" },
  { id: "3", name: "Feyenoord Rotterdam" },
  { id: "4", name: "FC Twente '65" },
];

const clubEloClubs: ClubEloClub[] = [
  { slug: "psv", name: "PSV" },
  { slug: "ajax", name: "Ajax" },
  { slug: "feyenoord", name: "Feyenoord" },
  { slug: "twente", name: "Twente" },
];

function generatedMappings(
  sources = sourceClubs,
  clubs = clubEloClubs,
  aliases: Parameters<typeof generateClubEloMappings>[2] = []
): ClubEloMapping[] {
  return generateClubEloMappings(sources, clubs, aliases, {
    scope,
    generatedAt: "2026-09-14T12:00:00.000Z",
  });
}

describe("ClubElo mapping generation", () => {
  it("generates exact matches as approved-confidence proposals", () => {
    const mappings = generatedMappings([
      { id: "1", name: "PSV" },
    ], [{ slug: "psv", name: "PSV" }]);

    expect(mappings[0]).toMatchObject({
      sourceId: "1",
      sourceName: "PSV",
      clubEloSlug: "psv",
      matchMethod: "exact",
      confidence: 1,
      status: "proposed",
      locked: false,
      scope,
      generatorVersion: "clubelo-mapping-v1",
    });
  });

  it("normalizes accents and punctuation for exact matching", () => {
    const [mapping] = generatedMappings(
      [{ id: "1", name: "Malmö & FF" }],
      [{ slug: "malmo-ff", name: "Malmo and FF" }]
    );

    expect(mapping).toMatchObject({
      clubEloSlug: "malmo-ff",
      matchMethod: "exact",
      confidence: 1,
    });
  });

  it("uses an explicit alias before fuzzy matching", () => {
    const mappings = generatedMappings(
      [{ id: "1", name: "PSV Eindhoven" }],
      [{ slug: "psv", name: "PSV" }],
      [{ sourceId: "1", alias: "PSV Eindhoven", clubEloSlug: "psv" }]
    );

    expect(mappings[0]).toMatchObject({
      clubEloSlug: "psv",
      matchMethod: "alias",
      confidence: 0.99,
    });
  });

  it("returns the best fuzzy candidate as a proposal", () => {
    const mappings = generatedMappings(
      [{ id: "1", name: "Feyenoord Rotterdam" }],
      [{ slug: "feyenoord", name: "Feyenoord" }]
    );

    expect(mappings[0].matchMethod).toBe("fuzzy");
    expect(mappings[0].clubEloSlug).toBe("feyenoord");
    expect(mappings[0].confidence).toBeGreaterThan(0.5);
    expect(mappings[0].status).toBe("proposed");
  });

  it("leaves a source club unresolved when no plausible candidate exists", () => {
    const [mapping] = generatedMappings(
      [{ id: "1", name: "FC Utrecht" }],
      [{ slug: "psv", name: "PSV" }]
    );

    expect(mapping).toMatchObject({
      clubEloSlug: null,
      matchMethod: "unresolved",
      confidence: 0,
      status: "unresolved",
    });
  });

  it("records deterministic metadata and sorts mappings by source id", () => {
    const mappings = generatedMappings([...sourceClubs].reverse(), clubEloClubs);

    expect(mappings.map((mapping) => mapping.sourceId)).toEqual(["1", "2", "3", "4"]);
    expect(mappings.every((mapping) => mapping.generatedAt === "2026-09-14T12:00:00.000Z")).toBe(true);
  });
});

describe("ClubElo mapping validation", () => {
  it("accepts complete approved current coverage and exposes production readiness", () => {
    const mappings = generatedMappings().map((mapping) =>
      approveMapping(mapping, {
        reviewer: "bas",
        approvedAt: "2026-09-14T13:00:00.000Z",
      })
    );

    const report = validateClubEloMappings(mappings, sourceClubs, {
      scope,
      requireApproved: true,
      minimumConfidence: 0.6,
    });

    expect(report.valid).toBe(true);
    expect(report.productionReady).toBe(true);
    expect(report.coverage).toEqual({ eligible: 4, mapped: 4, ratio: 1, required: 1 });
    expect(report.errors).toEqual([]);
  });

  it("reports missing, unresolved and unapproved current mappings", () => {
    const mappings = generatedMappings(sourceClubs.slice(0, 2));
    const report = validateClubEloMappings(mappings, sourceClubs, {
      scope,
      requireApproved: true,
    });

    expect(report.valid).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "missing-mapping",
      "unapproved-mapping",
    ]));
    expect(report.coverage.ratio).toBe(0.5);
  });

  it("rejects duplicate source mappings, duplicate slugs and low confidence", () => {
    const mappings = generatedMappings(sourceClubs.slice(0, 2));
    const duplicate: ClubEloMapping = {
      ...mappings[0],
      sourceId: "2",
      sourceName: "AFC Ajax",
      clubEloSlug: mappings[0].clubEloSlug,
      confidence: 0.6,
    };

    const report = validateClubEloMappings([...mappings, duplicate], sourceClubs.slice(0, 2), {
      scope,
      requireApproved: false,
      minimumConfidence: 0.8,
    });

    expect(report.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "duplicate-source",
      "duplicate-clubelo-slug",
      "low-confidence",
    ]));
  });

  it("enforces historical fixture coverage separately from current club coverage", () => {
    const historicalScope: MappingScope = { ...scope, kind: "historical", season: "2019/20" };
    const mappings = generatedMappings(sourceClubs.slice(0, 3), clubEloClubs, []).map((mapping) => ({
      ...mapping,
      scope: historicalScope,
    }));
    const report = validateClubEloMappings(mappings, sourceClubs, {
      scope: historicalScope,
      eligibleFixtures: [
        { homeSourceId: "1", awaySourceId: "2" },
        { homeSourceId: "1", awaySourceId: "3" },
        { homeSourceId: "2", awaySourceId: "4" },
        { homeSourceId: "3", awaySourceId: "4" },
      ],
      requireApproved: false,
    });

    expect(report.coverage).toEqual({ eligible: 4, mapped: 2, ratio: 0.5, required: 0.95 });
    expect(report.errors.map((error) => error.code)).toContain("coverage-below-threshold");
  });

  it("accepts exactly 95% historical fixture coverage and rejects just below it", () => {
    const historicalScope: MappingScope = { ...scope, kind: "historical", season: "2019/20" };
    const mappings = generatedMappings(sourceClubs.slice(0, 3)).map((mapping) => ({
      ...mapping,
      scope: historicalScope,
      confidence: 1,
    }));
    const eligibleFixtures = [
      ...Array.from({ length: 19 }, () => ({ homeSourceId: "1", awaySourceId: "2" })),
      { homeSourceId: "1", awaySourceId: "4" },
    ];
    const atBoundary = validateClubEloMappings(mappings, sourceClubs, {
      scope: historicalScope,
      eligibleFixtures,
      minimumConfidence: 0,
    });
    const belowBoundary = validateClubEloMappings(mappings, sourceClubs, {
      scope: historicalScope,
      eligibleFixtures: eligibleFixtures.slice(0, 18).concat({ homeSourceId: "2", awaySourceId: "4" }, { homeSourceId: "3", awaySourceId: "4" }),
      minimumConfidence: 0,
    });

    expect(atBoundary.coverage).toEqual({ eligible: 20, mapped: 19, ratio: 0.95, required: 0.95 });
    expect(atBoundary.errors.map((error) => error.code)).not.toContain("coverage-below-threshold");
    expect(belowBoundary.coverage.ratio).toBeLessThan(0.95);
    expect(belowBoundary.errors.map((error) => error.code)).toContain("coverage-below-threshold");
  });

  it("blocks conflicting aliases", () => {
    const mappings = generatedMappings([
      { id: "1", name: "Racing" },
    ], [
      { slug: "racing-a", name: "Racing A" },
      { slug: "racing-b", name: "Racing B" },
    ], [
      { sourceId: "1", alias: "Racing", clubEloSlug: "racing-a" },
      { sourceId: "1", alias: "Racing", clubEloSlug: "racing-b" },
    ]);
    const report = validateClubEloMappings(mappings, [{ id: "1", name: "Racing" }], {
      scope,
      aliases: [
        { sourceId: "1", alias: "Racing", clubEloSlug: "racing-a" },
        { sourceId: "1", alias: "Racing", clubEloSlug: "racing-b" },
      ],
    });

    expect(report.errors.map((error) => error.code)).toContain("conflicting-alias");
  });
});

describe("ClubElo mapping lifecycle", () => {
  it("approves a proposal and records a manual correction as locked", () => {
    const mapping = generatedMappings([
      { id: "1", name: "PSV Eindhoven" },
    ])[0];
    const approved = approveMapping(mapping, {
      reviewer: "bas",
      approvedAt: "2026-09-14T13:00:00.000Z",
    });
    const corrected = approveMapping(mapping, {
      reviewer: "bas",
      approvedAt: "2026-09-14T13:00:00.000Z",
      clubEloSlug: "psv-eindhoven",
      manual: true,
    });

    expect(approved).toMatchObject({ status: "approved", locked: false, matchMethod: "fuzzy" });
    expect(corrected).toMatchObject({
      clubEloSlug: "psv-eindhoven",
      status: "approved",
      locked: true,
      matchMethod: "manual",
    });
    expect(corrected.updatedAt).toBe("2026-09-14T13:00:00.000Z");
  });

  it("preserves locked mappings when generated candidates change", () => {
    const original = generatedMappings([
      { id: "1", name: "PSV Eindhoven" },
    ])[0];
    const locked = approveMapping(original, {
      reviewer: "bas",
      approvedAt: "2026-09-14T13:00:00.000Z",
      clubEloSlug: "psv-eindhoven",
      manual: true,
    });
    const regenerated = generatedMappings([
      { id: "1", name: "PSV" },
    ], [{ slug: "psv", name: "PSV" }]);

    expect(mergeLockedMappings(regenerated, [locked])).toEqual([locked]);
  });

  it("produces an explicit review diff for added, changed and removed mappings", () => {
    const original = generatedMappings([
      { id: "1", name: "PSV" },
      { id: "2", name: "Ajax" },
    ], [
      { slug: "psv", name: "PSV" },
      { slug: "ajax", name: "Ajax" },
    ]);
    const changed = original.map((mapping) => mapping.sourceId === "1"
      ? { ...mapping, clubEloSlug: "psv-eindhoven", matchMethod: "manual" as const, locked: true }
      : mapping
    );
    const added = generatedMappings([
      { id: "1", name: "PSV" },
      { id: "2", name: "Ajax" },
      { id: "3", name: "Feyenoord" },
    ], [
      { slug: "psv", name: "PSV" },
      { slug: "ajax", name: "Ajax" },
      { slug: "feyenoord", name: "Feyenoord" },
    ]);

    expect(diffClubEloMappings(original, added.filter((mapping) => mapping.sourceId !== "2").concat(changed[0]))).toEqual([
      expect.objectContaining({ sourceId: "1", change: "changed" }),
      expect.objectContaining({ sourceId: "2", change: "removed" }),
      expect.objectContaining({ sourceId: "3", change: "added" }),
    ]);
  });

  it("allows only supported status transitions and protects locked mappings", () => {
    const mapping = generatedMappings([
      { id: "1", name: "PSV" },
    ], [{ slug: "psv", name: "PSV" }])[0];
    const rejected = transitionMappingStatus(mapping, "rejected", {
      changedAt: "2026-09-14T13:00:00.000Z",
    });
    const reconsidered = transitionMappingStatus(rejected, "proposed", {
      changedAt: "2026-09-14T14:00:00.000Z",
    });
    const locked = approveMapping(mapping, {
      reviewer: "bas",
      approvedAt: "2026-09-14T13:00:00.000Z",
      manual: true,
      clubEloSlug: "psv-corrected",
    });

    expect(rejected.status).toBe("rejected");
    expect(reconsidered.status).toBe("proposed");
    expect(() => transitionMappingStatus(mapping, "approved", { changedAt: "2026-09-14T13:00:00.000Z" })).toThrow(
      "approved mappings require approval metadata"
    );
    expect(() => transitionMappingStatus(locked, "rejected", { changedAt: "2026-09-14T14:00:00.000Z" })).toThrow(
      "locked mappings cannot change"
    );
  });

  it("fails closed when production selection contains an unapproved mapping", () => {
    const mappings = generatedMappings([
      { id: "1", name: "PSV" },
    ], [{ slug: "psv", name: "PSV" }]);

    expect(() => approvedMappingsForProduction(mappings, [{ id: "1", name: "PSV" }], {
      scope,
    })).toThrow("unapproved-mapping");
    expect(approvedMappingsForProduction(
      mappings.map((mapping) => approveMapping(mapping, {
        reviewer: "bas",
        approvedAt: "2026-09-14T13:00:00.000Z",
      })),
      [{ id: "1", name: "PSV" }],
      { scope }
    )).toHaveLength(1);
  });
});
