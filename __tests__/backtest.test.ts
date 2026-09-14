import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculateChampionMetrics,
  calculateMatchMetrics,
  evaluatePromotionGate,
  FileBacktestReportStore,
  filterBacktestRows,
  pairedSeasonAwareBootstrap,
  runChronologicalBacktest,
  transitionModelStatus,
  verifyBacktestReproducibility,
  type BacktestMatchRow,
  type MatchPrediction,
} from "../lib/backtest";

const probability = { home: 0.5, draw: 0.25, away: 0.25 };

function row(id: string, date: string, round: number, overrides: Partial<BacktestMatchRow> = {}): BacktestMatchRow {
  return {
    id,
    competitionId: "league",
    season: date.slice(0, 4),
    homeTeamId: "home",
    awayTeamId: `away-${id}`,
    competition: { type: "league", tier: 1, phase: "regular" },
    status: "finished",
    homeGoals: 1,
    awayGoals: 0,
    homeElo: 1550,
    awayElo: 1500,
    homeAdvantage: 50,
    mapped: true,
    date,
    round,
    clubEloDirect: probability,
    clubElo: probability,
    bzzoiro: probability,
    poisson: probability,
    ...overrides,
  };
}

describe("backtest metrics", () => {
  it("calculates multiclass log loss, Brier, and bucket reliability", () => {
    const predictions: MatchPrediction[] = [
      { rowId: "a", competitionId: "league", season: "2022/23", round: 1, bucket: 50, actual: "home", probability: { home: 0.5, draw: 0.25, away: 0.25 } },
      { rowId: "b", competitionId: "league", season: "2022/23", round: 1, bucket: 50, actual: "away", probability: { home: 0.25, draw: 0.25, away: 0.5 } },
    ];
    const metrics = calculateMatchMetrics(predictions);
    expect(metrics.rows).toBe(2);
    expect(metrics.logLoss).toBeCloseTo(Math.log(2));
    expect(metrics.brierScore).toBeCloseTo(0.375);
    expect(metrics.reliability).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: "home", bucket: 50, predicted: 0.375, observed: 0.5 }),
      expect.objectContaining({ outcome: "draw", bucket: 50, predicted: 0.25, observed: 0 }),
    ]));
    expect(calculateMatchMetrics([{ ...predictions[0], actual: "draw", probability: { home: 1, draw: 0, away: 0 } }]).logLoss).toBeGreaterThan(30);
  });

  it("calculates champion-probability metrics per club", () => {
    const metrics = calculateChampionMetrics([
      { id: "a", competitionId: "league", season: "2022/23", clubId: "ajax", actualChampion: true, probability: 0.8 },
      { id: "b", competitionId: "league", season: "2022/23", clubId: "feyenoord", actualChampion: false, probability: 0.2 },
    ]);
    expect(metrics.logLoss).toBeCloseTo(-Math.log(0.8));
    expect(metrics.brierScore).toBeCloseTo(0.04);
    expect(metrics.byClub.ajax.rows).toBe(1);
    expect(metrics.byClub.ajax.calibrationError).toBeCloseTo(0.2);
  });
});

describe("chronological backtests", () => {
  it("reports invalid, duplicate, unmapped, and ineligible rows", () => {
    const duplicate = row("duplicate", "2022-08-01T12:00:00.000Z", 1);
    const result = filterBacktestRows([
      duplicate,
      { ...duplicate },
      row("cup", "2022-08-02T12:00:00.000Z", 1, { competition: { type: "cup", tier: 1, phase: "group" } }),
      row("unmapped", "2022-08-03T12:00:00.000Z", 1, { mapped: false }),
      row("scheduled", "2022-08-04T12:00:00.000Z", 1, { status: "scheduled" }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.coverage.reasonCounts).toMatchObject({ duplicate: 1, "not-regular-first-division": 1, unmapped: 1, "not-completed": 1 });
  });

  it("never trains on a test period or on a future-rated input", () => {
    const rows = [
      row("old", "2022-08-01T12:00:00.000Z", 1, { season: "2022/23" }),
      row("test", "2022-08-08T12:00:00.000Z", 2, { season: "2022/23" }),
      row("future-rating", "2022-08-15T12:00:00.000Z", 3, { season: "2022/23", homeRatingMeasuredAt: "2022-08-16T00:00:00.000Z" }),
    ];
    const report = runChronologicalBacktest(rows, { datasetVersion: "test-v1", generatedAt: "2026-09-14T00:00:00.000Z" });
    const fold = report.folds.find((candidate) => candidate.round === 2)!;
    expect(fold.trainingThrough).toBe("2022-08-01T12:00:00.000Z");
    expect(fold.leakage).toEqual({ passed: true, trainingRowsAtOrAfterTestStart: 0, futureMeasuredRatings: 0, futureAsOfInputs: 0 });
    expect(report.coverage.reasonCounts["unfrozen-input"]).toBe(1);
    expect(report.reproducibility.inputHash).toBe(runChronologicalBacktest(rows, { datasetVersion: "test-v1", generatedAt: "2026-09-14T00:00:00.000Z" }).reproducibility.inputHash);
    expect(verifyBacktestReproducibility(rows, { datasetVersion: "test-v1", generatedAt: "2026-09-14T00:00:00.000Z" })).toBe(true);
  });

  it("uses one shared eligible test set for every model", () => {
    const rows = [row("old", "2022-08-01T12:00:00.000Z", 1), row("test-1", "2022-08-08T12:00:00.000Z", 2), row("test-2", "2022-08-08T13:00:00.000Z", 2)];
    const report = runChronologicalBacktest(rows, {
      datasetVersion: "test-v1",
      predictors: { poisson: (candidate) => candidate.id === "test-2" ? null : probability },
    });
    const fold = report.folds.find((candidate) => candidate.round === 2)!;
    expect(fold.eligibleRows).toBe(1);
    expect(fold.coverage.exclusions).toEqual([expect.objectContaining({ rowId: "test-2", reason: "missing-model-prediction" })]);
    expect(Object.values(fold.metrics).map((metric) => metric?.rows)).toEqual([1, 1, 1, 1]);
  });
});

describe("bootstrap and promotion", () => {
  it("is deterministic and samples whole seasons as paired units", () => {
    const observations = [
      { season: "2021/22", candidate: 0.1, baseline: 0.2 },
      { season: "2022/23", candidate: 0.3, baseline: 0.2 },
    ];
    const options = { confidenceLevel: 0.95, bootstrapIterations: 100, bootstrapSeed: 7 } as const;
    expect(pairedSeasonAwareBootstrap(observations, "logLoss", options)).toEqual(pairedSeasonAwareBootstrap(observations, "logLoss", options));
    expect(pairedSeasonAwareBootstrap([], "logLoss", options)).toBeNull();
  });

  it("passes and fails the non-inferiority promotion gate closed", () => {
    const passing = {
      version: "promotion-gate-v1" as const, metric: "logLoss" as const, observed: 0, lower: -0.01, upper: 0.01, confidenceLevel: 0.95, iterations: 100, seed: 1, seasons: ["2021/22", "2022/23", "2023/24"],
    };
    const brier = { ...passing, metric: "brierScore" as const };
    const champion = { ...passing, metric: "calibrationError" as const };
    const input = { candidate: "elo-monte-carlo-v1" as const, baseline: "bzzoiro" as const, coverage: 1, completeSeasons: 3, matchLogLoss: passing, matchBrierScore: brier, championCalibration: champion, championCalibrationAbsolute: 0.01, reproducible: true, shadowRun: { verified: true, runId: "shadow-1", inputHash: "input-1", datasetVersion: "test-v1", completed: true, fullRound: true, dataQualityErrors: [] }, shadowRunInputHash: "input-1", datasetVersion: "test-v1" };
    expect(evaluatePromotionGate(input)).toMatchObject({ passed: true, status: "production" });
    expect(evaluatePromotionGate({ ...input, matchBrierScore: { ...brier, upper: 0.03 } })).toMatchObject({ passed: false, status: "provisional", reasons: expect.arrayContaining(["brier-non-inferiority-failed"]) });
    expect(evaluatePromotionGate({ ...input, coverage: 0.9 })).toMatchObject({ passed: false, status: "provisional", reasons: expect.arrayContaining(["insufficient-coverage"]) });
  });

  it("enforces provisional, shadow, and production transitions", () => {
    const checks = { historySufficient: true, coverageSufficient: true, backtestPassed: true, reproducibilityPassed: true, shadowRunPassed: true };
    expect(transitionModelStatus("provisional", "shadow", checks)).toBe("shadow");
    expect(transitionModelStatus("shadow", "production", checks)).toBe("production");
    expect(() => transitionModelStatus("provisional", "production", checks)).toThrow(/shadow/);
    expect(transitionModelStatus("shadow", "production", { ...checks, coverageSufficient: false })).toBe("provisional");
  });

  it("rejects invalid promotion thresholds", () => {
    expect(() => evaluatePromotionGate({
      candidate: "elo-monte-carlo-v1",
      baseline: "bzzoiro",
      coverage: 1,
      completeSeasons: 3,
      matchLogLoss: null,
      matchBrierScore: null,
      championCalibration: null,
      reproducible: false,
      thresholds: { minimumCoverage: 2 },
    })).toThrow(/minimumCoverage/);
  });

  it("persists a versioned report atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kampioenen-backtest-"));
    try {
      const report = runChronologicalBacktest([row("old", "2022-08-01T12:00:00.000Z", 1), row("test", "2022-08-08T12:00:00.000Z", 2)], { datasetVersion: "test-v1", generatedAt: "2026-09-14T00:00:00.000Z" });
      await new FileBacktestReportStore(directory).save(report);
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      expect(JSON.parse(await readFile(join(directory, files[0]), "utf8"))).toMatchObject({ reportId: report.reportId, schemaVersion: 1, reportVersion: "chronological-backtest-v1" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
