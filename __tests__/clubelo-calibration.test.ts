import { describe, expect, it } from "vitest";
import {
  bucketLowerBound,
  calibrateClubEloRows,
  effectiveEloDelta,
  filterCalibrationRows,
  probabilityForCalibration,
  type HistoricalCalibrationRow,
} from "../lib/clubelo-calibration";

const regularLeague = {
  type: "league" as const,
  tier: 1,
  phase: "regular" as const,
};

function row(overrides: Partial<HistoricalCalibrationRow> = {}): HistoricalCalibrationRow {
  return {
    id: "match-1",
    competitionId: "eredivisie",
    season: "2022/23",
    homeTeamId: "home",
    awayTeamId: "away",
    competition: regularLeague,
    status: "finished",
    homeGoals: 1,
    awayGoals: 0,
    homeElo: 1600,
    awayElo: 1500,
    homeAdvantage: 50,
    mapped: true,
    ...overrides,
  };
}

describe("ClubElo calibration filtering", () => {
  it("keeps only completed regular first-division rows and reports every exclusion reason", () => {
    const report = filterCalibrationRows([
      row(),
      row({ id: "duplicate", date: "2022-08-01T00:00:00.000Z" }),
      row({ id: "duplicate-2", date: "2022-08-01T00:00:00.000Z" }),
      row({ id: "cup", date: "2022-08-02T00:00:00.000Z", competition: { type: "cup", tier: 1, phase: "group" } }),
      row({ id: "scheduled", date: "2022-08-03T00:00:00.000Z", status: "scheduled", homeGoals: undefined, awayGoals: undefined }),
      row({ id: "unreliable", date: "2022-08-04T00:00:00.000Z", preMatchReliable: false }),
      row({ id: "no-score", date: "2022-08-05T00:00:00.000Z", homeGoals: undefined, awayGoals: undefined }),
      row({ id: "unmapped", date: "2022-08-06T00:00:00.000Z", mapped: false }),
      row({ id: "incomplete", date: "2022-08-07T00:00:00.000Z", homeTeamId: "" }),
    ]);

    expect(report.includedRows.map((included) => included.id)).toEqual(["match-1", "duplicate"]);
    expect(report.reasonCounts).toEqual({
      duplicate: 1,
      "not-regular-first-division": 1,
      "not-completed": 1,
      "unreliable-pre-match": 1,
      "missing-final-score": 1,
      unmapped: 1,
      "incomplete-parse": 1,
    });
    expect(report.coverage).toMatchObject({ suppliedRows: 9, includedRows: 2, excludedRows: 7, ratio: 2 / 9 });
  });

  it("excludes rows whose teams are absent from the approved historical mapping set", () => {
    const report = filterCalibrationRows([row()], { mappedTeamIds: new Set(["home"]) });

    expect(report.includedRows).toHaveLength(0);
    expect(report.exclusions[0]).toMatchObject({ reason: "unmapped", rowId: "match-1" });
  });
});

describe("ClubElo calibration buckets", () => {
  it("uses the pre-match home Elo, HFA and away Elo and has deterministic 50-point boundaries", () => {
    expect(effectiveEloDelta(row({ homeElo: 1600, homeAdvantage: 40, awayElo: 1500 }))).toBe(140);
    expect(bucketLowerBound(-51)).toBe(-100);
    expect(bucketLowerBound(-50)).toBe(-50);
    expect(bucketLowerBound(0)).toBe(0);
    expect(bucketLowerBound(49.999)).toBe(0);
    expect(bucketLowerBound(50)).toBe(50);
  });

  it("linearly interpolates adjacent buckets and always returns normalized non-negative probabilities", () => {
    const artifacts = calibrateClubEloRows([
      row({ id: "home-bucket", date: "2022-08-01T00:00:00.000Z", homeElo: 1500, awayElo: 1500, homeAdvantage: 0, homeGoals: 1, awayGoals: 0 }),
      row({ id: "away-bucket", date: "2022-08-02T00:00:00.000Z", homeElo: 1550, awayElo: 1500, homeAdvantage: 0, homeGoals: 0, awayGoals: 1 }),
    ], { poolingFactor: 0, minimumEffectiveObservations: 0, fullSeasons: ["2022/23"], generatedAt: "2026-09-14T00:00:00.000Z" });

    const probability = probabilityForCalibration(artifacts, "eredivisie", 25);
    expect(probability.home).toBeCloseTo(0.5);
    expect(probability.draw).toBeCloseTo(0);
    expect(probability.away).toBeCloseTo(0.5);
    expect(probability.home + probability.draw + probability.away).toBeCloseTo(1);
    expect(Math.min(probability.home, probability.draw, probability.away)).toBeGreaterThanOrEqual(0);
  });
});

describe("ClubElo calibration artifacts", () => {
  it("applies exponential season weights, records effective counts and publishes versions, metrics and coverage", () => {
    const artifacts = calibrateClubEloRows([
      row({ id: "old", season: "2020/21", homeGoals: 1, awayGoals: 0, homeElo: 1500, awayElo: 1500, homeAdvantage: 0 }),
      row({ id: "middle", season: "2021/22", homeGoals: 0, awayGoals: 0, homeElo: 1500, awayElo: 1500, homeAdvantage: 0 }),
      row({ id: "new", season: "2022/23", homeGoals: 0, awayGoals: 1, homeElo: 1500, awayElo: 1500, homeAdvantage: 0 }),
    ], {
      seasonOrder: ["2020/21", "2021/22", "2022/23"],
      seasonDecayFactor: 0.5,
      poolingFactor: 0,
      minimumEffectiveObservations: 0,
      fullSeasons: ["2020/21", "2021/22", "2022/23"],
      datasetVersion: "historical-first-divisions-1",
      modelVersion: "elo-calibration-test-model",
      calibrationVersion: "calibration-test-1",
      generatedAt: "2026-09-14T00:00:00.000Z",
      selectedBy: "chronological-backtest",
      selectionDatasetVersion: "folds-1",
    });

    const bucket = artifacts.generalPrior.buckets.find((candidate) => candidate.lowerBound === 0)!;
    expect(bucket.weightedObservations).toBeCloseTo(1.75);
    expect(bucket.effectiveObservations).toBeCloseTo((1.75 ** 2) / (1 + 0.25 + 0.0625));
    expect(artifacts.generalPrior.overallProbability).toEqual({
      home: expect.closeTo(0.25 / 1.75, 10),
      draw: expect.closeTo(0.5 / 1.75, 10),
      away: expect.closeTo(1 / 1.75, 10),
    });
    expect(artifacts.datasetVersion).toBe("historical-first-divisions-1");
    expect(artifacts.generalPrior).toMatchObject({
      schemaVersion: 1,
      artifactKind: "general-prior",
      modelVersion: "elo-calibration-test-model",
      calibrationVersion: "calibration-test-1",
      status: "calibrated",
      provisional: false,
      includedRows: 3,
      metrics: { rows: 3, logLoss: expect.any(Number), brierScore: expect.any(Number), calibrationError: expect.any(Number), bucketCalibration: expect.any(Array) },
    });
    expect(artifacts.generalPrior.coverage).toMatchObject({ includedRows: 3, includedSeasons: ["2020/21", "2021/22", "2022/23"] });
    expect(artifacts.parameters).toMatchObject({ seasonDecayFactor: 0.5, poolingFactor: 0, selectedBy: "chronological-backtest", selectionDatasetVersion: "folds-1" });
  });

  it("pools a thin competition bucket toward the general prior and uses the general prior for an unknown competition", () => {
    const artifacts = calibrateClubEloRows([
      row({ id: "local-home", competitionId: "local", homeGoals: 1, awayGoals: 0, homeElo: 1500, awayElo: 1500, homeAdvantage: 0 }),
      row({ id: "other-away", competitionId: "other", homeGoals: 0, awayGoals: 1, homeElo: 1500, awayElo: 1500, homeAdvantage: 0 }),
    ], { poolingFactor: 1, minimumEffectiveObservations: 0, fullSeasons: ["2022/23"] });

    const local = probabilityForCalibration(artifacts, "local", 0);
    expect(local.home).toBeCloseTo(0.75);
    expect(local.draw).toBeCloseTo(0);
    expect(local.away).toBeCloseTo(0.25);
    expect(probabilityForCalibration(artifacts, "missing", 0)).toEqual({ home: 0.5, draw: 0, away: 0.5 });
  });

  it("marks a competition provisional with too little complete history or thin relevant buckets", () => {
    const artifacts = calibrateClubEloRows([row()], {
      minimumEffectiveObservations: 2,
      fullSeasons: ["2022/23"],
    });

    expect(artifacts.competitions.eredivisie).toMatchObject({
      status: "provisional",
      provisional: true,
      provisionalReasons: expect.arrayContaining([
        "fewer-than-three-complete-seasons",
        "insufficient-effective-observations",
        "thin-relevant-bucket",
      ]),
    });
  });
});
