import { describe, expect, it } from "vitest";
import { calibrateClubEloRows } from "../lib/clubelo-calibration";
import { runClubEloPrediction, type ProductionPredictionInputs } from "../lib/production-prediction";
import { createCompetitionRules } from "../lib/competition-rules";
import type { Fixture, Team } from "../lib/data";
import type { ClubEloMappingDocument } from "../lib/clubelo-mapping";
import type { ClubEloSnapshot } from "../lib/clubelo-import";
import { calculateClubEloSnapshotHash } from "../lib/clubelo-import";

const rules = createCompetitionRules({
  version: "test-rules-v1",
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakers: ["goalDifference", "goalsFor"],
});

const teams: Team[] = [
  { id: "home", name: "Home", shortName: "Home", points: 10, played: 4, won: 3, drawn: 1, lost: 0, goalsFor: 8, goalsAgainst: 2 },
  { id: "away", name: "Away", shortName: "Away", points: 8, played: 4, won: 2, drawn: 2, lost: 0, goalsFor: 6, goalsAgainst: 3 },
];

const fixture: Fixture = {
  id: "fixture-1",
  date: "2026-10-01",
  round: 7,
  homeTeam: "home",
  awayTeam: "away",
  homeWinProb: 0,
  drawProb: 0,
  awayWinProb: 1,
  source: "poisson",
};

function mapping(sourceId: string, slug: string) {
  return {
    sourceId,
    sourceName: sourceId,
    clubEloSlug: slug,
    scope: { competitionId: "test-league", season: "2026/27", kind: "current" as const },
    confidence: 1,
    matchMethod: "manual" as const,
    status: "approved" as const,
    locked: true,
    candidates: [],
    generatorVersion: "clubelo-mapping-v1",
    generatedAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    approvedAt: "2026-09-14T00:00:00.000Z",
    approvedBy: "test",
  };
}

function snapshot(): ClubEloSnapshot {
  const value: ClubEloSnapshot = {
    schemaVersion: 1,
    snapshotId: "snapshot-1",
    snapshotHash: "",
    competitionId: "test-league",
    season: "2026/27",
    runRound: 4,
    sourceRound: 4,
    fetchedAt: "2026-09-14T00:00:00.000Z",
    freshness: "current",
    reused: false,
    strengths: [
      { teamId: "home", elo: 1600, source: "clubelo", measuredAt: new Date("2026-09-13T00:00:00.000Z") },
      { teamId: "away", elo: 1500, source: "clubelo", measuredAt: new Date("2026-09-13T00:00:00.000Z") },
    ],
  };
  value.snapshotHash = calculateClubEloSnapshotHash(value);
  return value;
}

function calibration() {
  const competition = { type: "league" as const, tier: 1, phase: "regular" as const };
  return calibrateClubEloRows([
    { id: "match-1", competitionId: "test-league", season: "2023/24", homeTeamId: "home", awayTeamId: "away", competition, status: "finished" as const, homeGoals: 1, awayGoals: 0, homeElo: 1600, awayElo: 1500, homeAdvantage: 50, mapped: true },
    { id: "match-2", competitionId: "test-league", season: "2024/25", homeTeamId: "home", awayTeamId: "away", competition, status: "finished" as const, homeGoals: 1, awayGoals: 0, homeElo: 1600, awayElo: 1500, homeAdvantage: 50, mapped: true },
    { id: "match-3", competitionId: "test-league", season: "2025/26", homeTeamId: "home", awayTeamId: "away", competition, status: "finished" as const, homeGoals: 1, awayGoals: 0, homeElo: 1600, awayElo: 1500, homeAdvantage: 50, mapped: true },
  ], { fullSeasons: ["2023/24", "2024/25", "2025/26"], minimumEffectiveObservations: 0, poolingFactor: 0, generatedAt: "2026-09-14T00:00:00.000Z" });
}

function inputs(overrides: Partial<ProductionPredictionInputs> = {}): ProductionPredictionInputs {
  const document: ClubEloMappingDocument = {
    schemaVersion: 1,
    generatorVersion: "clubelo-mapping-v1",
    generatedAt: "2026-09-14T00:00:00.000Z",
    scope: { competitionId: "test-league", season: "2026/27", kind: "current" },
    mappings: [mapping("home", "home"), mapping("away", "away")],
  };
  return { mapping: document, snapshot: snapshot(), calibration: calibration(), ...overrides };
}

function run(productionInputs = inputs()) {
  return runClubEloPrediction({
    teams,
    fixtures: [fixture],
    totalRounds: 7,
    iterations: 250,
    seed: 42,
    competition: "test-league",
    season: "2026/27",
    standingsSnapshotId: "standings-1",
    fixturesSnapshotId: "fixtures-1",
    inputs: productionInputs,
    rules,
  });
}

describe("production ClubElo prediction pipeline", () => {
  it("uses calibrated probabilities in one reproducible joint run and publishes metadata", () => {
    const first = run();
    const second = run();

    expect(second).toEqual(first);
    expect(first.fixtures?.[0]).toMatchObject({ source: "clubelo", homeWinProb: 1, drawProb: 0, awayWinProb: 0 });
    expect(first.clubResults.home.totalChampionshipProbability).toBe(1);
    expect(first.metadata).toMatchObject({
      modelVersion: "elo-monte-carlo-v1",
      calibration: { status: "calibrated", provisional: false },
      mapping: { coverage: { eligible: 1, mapped: 1, ratio: 1 } },
      snapshot: { id: "snapshot-1", freshness: "current", reused: false },
      coverage: { teams: 2, strengths: 2, fixtures: 1, calibratedFixtures: 1 },
    });
  });

  it("falls back to the general prior when no competition artifact exists", () => {
    const all = calibration();
    const result = run(inputs({ calibration: { ...all, competitions: {} } }));

    expect(result.fixtures?.[0].source).toBe("clubelo");
    expect(result.metadata?.calibration?.artifactId).toBe(all.generalPrior.artifactId);
  });

  it("fails closed for an unapproved mapping or an incomplete snapshot", () => {
    const unapproved = inputs();
    unapproved.mapping = { ...unapproved.mapping, mappings: unapproved.mapping.mappings.map((item, index) => index === 0 ? { ...item, status: "proposed" as const, locked: false } : item) };
    expect(() => run(unapproved)).toThrow(/production-ready|unapproved/i);

    const incompleteSnapshot = { ...snapshot(), strengths: [snapshot().strengths[0]] };
    incompleteSnapshot.snapshotHash = calculateClubEloSnapshotHash(incompleteSnapshot);
    const incomplete = inputs({ snapshot: incompleteSnapshot });
    expect(() => run(incomplete)).toThrow(/missing strength|incomplete/i);
  });
});
