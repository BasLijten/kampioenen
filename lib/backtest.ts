import { createHash } from "node:crypto";
import {
  calibrateClubEloRows,
  effectiveEloDelta,
  probabilityForCalibration,
  type HistoricalCalibrationRow,
  type CalibrationBuildOptions,
} from "./clubelo-calibration";

export const BACKTEST_SCHEMA_VERSION = 1 as const;
export const BACKTEST_REPORT_VERSION = "chronological-backtest-v1" as const;
export const PROMOTION_GATE_VERSION = "promotion-gate-v1" as const;

export type BacktestOutcome = "home" | "draw" | "away";
export type BacktestModel = "elo-monte-carlo-v1" | "clubelo-direct" | "bzzoiro" | "poisson";

export interface BacktestProbability {
  home: number;
  draw: number;
  away: number;
}

/** A normalized historical match row with optional predictions from benchmarks. */
export type BacktestMatchRow = HistoricalCalibrationRow & {
  date: string;
  round: number;
  actualOutcome?: BacktestOutcome;
  asOf?: string;
  availableAt?: string;
  clubEloDirect?: BacktestProbability;
  clubEloDirectProbability?: BacktestProbability;
  clubElo?: BacktestProbability;
  bzzoiro?: BacktestProbability;
  bzzoiroProbability?: BacktestProbability;
  poisson?: BacktestProbability;
  poissonProbability?: BacktestProbability;
};

export interface ChampionBacktestRow {
  id: string;
  competitionId: string;
  season: string;
  round: number;
  date: string;
  clubId: string;
  actualChampion: boolean;
  probabilities: Partial<Record<BacktestModel, number>>;
  asOf?: string;
  availableAt?: string;
}

export interface BacktestExclusion {
  rowId: string;
  reason:
    | "incomplete-parse"
    | "invalid-date"
    | "invalid-round"
    | "not-completed"
    | "not-regular-first-division"
    | "duplicate"
    | "unmapped"
    | "unfrozen-input"
    | "missing-model-prediction"
    | "invalid-model-prediction";
  detail: string;
  models?: BacktestModel[];
}

export interface BacktestCoverage {
  suppliedRows: number;
  eligibleRows: number;
  excludedRows: number;
  ratio: number;
  exclusions: BacktestExclusion[];
  reasonCounts: Partial<Record<BacktestExclusion["reason"], number>>;
}

export interface BacktestFold {
  id: string;
  competitionId: string;
  season: string;
  round: number;
  testStartsAt: string;
  testEndsAt: string;
  frozenAsOf: string;
  trainingRows: number;
  trainingThrough: string | null;
  testRows: number;
  eligibleRows: number;
  coverage: BacktestCoverage;
  leakage: {
    passed: boolean;
    trainingRowsAtOrAfterTestStart: number;
    futureMeasuredRatings: number;
    futureAsOfInputs: number;
  };
  metrics: Record<BacktestModel, MatchMetrics | null>;
  championMetrics: Partial<Record<BacktestModel, ChampionMetrics>>;
}

export interface ReliabilityCell {
  outcome: BacktestOutcome;
  bucket: number;
  rows: number;
  predicted: number;
  observed: number;
  absoluteError: number;
}

export interface MatchLossObservation {
  rowId: string;
  season: string;
  logLoss: number;
  brierScore: number;
}

export interface MatchMetrics {
  rows: number;
  logLoss: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  byOutcome: Record<BacktestOutcome, { rows: number; logLoss: number | null; brierScore: number | null }>;
  reliability: ReliabilityCell[];
  losses: MatchLossObservation[];
}

export interface MatchPrediction {
  rowId: string;
  competitionId: string;
  season: string;
  round: number;
  bucket: number;
  actual: BacktestOutcome;
  probability: BacktestProbability;
}

export interface ChampionPrediction {
  id: string;
  competitionId: string;
  season: string;
  clubId: string;
  actualChampion: boolean;
  probability: number;
}

export interface ChampionMetrics {
  rows: number;
  logLoss: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  byClub: Record<string, { rows: number; logLoss: number | null; brierScore: number | null; calibrationError: number | null }>;
}

export interface BootstrapDifference {
  version: typeof PROMOTION_GATE_VERSION;
  metric: "logLoss" | "brierScore" | "calibrationError";
  observed: number;
  lower: number;
  upper: number;
  confidenceLevel: number;
  iterations: number;
  seed: number;
  seasons: string[];
}

export interface PromotionThresholds {
  version: string;
  minimumCoverage: number;
  minimumCompleteSeasons: number;
  logLossMargin: number;
  brierScoreMargin: number;
  championCalibrationMargin: number;
  confidenceLevel: number;
  bootstrapIterations: number;
  bootstrapSeed: number;
}

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  version: "promotion-thresholds-v1",
  minimumCoverage: 0.95,
  minimumCompleteSeasons: 3,
  logLossMargin: 0.02,
  brierScoreMargin: 0.02,
  championCalibrationMargin: 0.02,
  confidenceLevel: 0.95,
  bootstrapIterations: 1000,
  bootstrapSeed: 1,
};

export interface ShadowRunCheck {
  verified: boolean;
  runId: string;
  inputHash: string;
  datasetVersion: string;
  completed: boolean;
  fullRound: boolean;
  dataQualityErrors: string[];
}

export interface PromotionGateInput {
  candidate: BacktestModel;
  baseline: BacktestModel;
  thresholds?: Partial<PromotionThresholds>;
  coverage: number;
  completeSeasons: number;
  matchLogLoss: BootstrapDifference | null;
  matchBrierScore: BootstrapDifference | null;
  championCalibration: BootstrapDifference | null;
  championCalibrationAbsolute?: number | null;
  reproducible: boolean;
  shadowRun?: ShadowRunCheck;
  shadowRunInputHash?: string;
  datasetVersion?: string;
}

export interface PromotionDecision {
  gateVersion: typeof PROMOTION_GATE_VERSION;
  thresholdVersion: string;
  passed: boolean;
  backtestPassed: boolean;
  reproducibilityPassed: boolean;
  shadowRunPassed: boolean;
  status: "provisional" | "shadow" | "production";
  reasons: string[];
}

export interface BacktestPredictors {
  [model: string]: (row: BacktestMatchRow, trainingRows: readonly BacktestMatchRow[]) => BacktestProbability | null;
}

export interface ChronologicalBacktestOptions {
  datasetVersion: string;
  generatedAt?: string;
  baseline?: BacktestModel;
  models?: readonly BacktestModel[];
  predictors?: Partial<BacktestPredictors>;
  calibration?: CalibrationBuildOptions;
  minimumTrainingRows?: number;
  completeSeasons?: readonly string[];
  thresholds?: Partial<PromotionThresholds>;
  reproducible?: boolean;
  shadowRun?: ShadowRunCheck;
  championRows?: readonly ChampionBacktestRow[];
}

export interface BacktestModelReport {
  rows: number;
  match: MatchMetrics;
  champion: ChampionMetrics | null;
}

export interface ChronologicalBacktestReport {
  schemaVersion: typeof BACKTEST_SCHEMA_VERSION;
  reportVersion: typeof BACKTEST_REPORT_VERSION;
  reportId: string;
  generatedAt: string;
  datasetVersion: string;
  baseline: BacktestModel;
  models: Record<BacktestModel, BacktestModelReport>;
  folds: BacktestFold[];
  coverage: {
    suppliedRows: number;
    eligibleRows: number;
    ratio: number;
    excludedRows: number;
    reasonCounts: Partial<Record<BacktestExclusion["reason"], number>>;
  };
  bootstrap: Partial<Record<"logLoss" | "brierScore" | "championCalibration", BootstrapDifference>>;
  thresholds: PromotionThresholds;
  promotion: PromotionDecision;
  reproducibility: { inputHash: string; outputHash: string; exact: boolean };
}

export interface BacktestReportStore {
  save(report: ChronologicalBacktestReport): Promise<void>;
}

export class FileBacktestReportStore implements BacktestReportStore {
  constructor(private readonly directory: string) {}

  async save(report: ChronologicalBacktestReport): Promise<void> {
    const { mkdir, rename, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(this.directory, { recursive: true });
    const safeDataset = report.datasetVersion.replace(/[^A-Za-z0-9_-]/g, "_");
    const path = join(this.directory, `${safeDataset}-${report.reportId}.json`);
    const temporaryPath = `${path}.${report.reportId}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function outcomeOf(row: BacktestMatchRow): BacktestOutcome | null {
  if (row.actualOutcome) return row.actualOutcome;
  const homeGoals = row.homeGoals;
  const awayGoals = row.awayGoals;
  if (!finite(homeGoals) || !finite(awayGoals)) return null;
  return homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
}

function probability(value: BacktestProbability | null | undefined): BacktestProbability | null {
  if (!value || !finite(value.home) || !finite(value.draw) || !finite(value.away)) return null;
  if (value.home < 0 || value.draw < 0 || value.away < 0) return null;
  const total = value.home + value.draw + value.away;
  if (Math.abs(total - 1) > 1e-8) return null;
  return { home: value.home, draw: value.draw, away: value.away };
}

function validDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function hasFutureInput(row: BacktestMatchRow, asOf: string): boolean {
  return [row.homeRatingMeasuredAt, row.awayRatingMeasuredAt, row.asOf, row.availableAt]
    .some((value) => value && validDate(value) && dateValue(value) > dateValue(asOf));
}

function dateValue(value: string): number {
  return Date.parse(value);
}

function modelProbability(row: BacktestMatchRow, model: BacktestModel): BacktestProbability | null {
  if (model === "elo-monte-carlo-v1") return null;
  if (model === "clubelo-direct") return probability(row.clubEloDirect ?? row.clubEloDirectProbability ?? row.clubElo);
  if (model === "bzzoiro") return probability(row.bzzoiro ?? row.bzzoiroProbability);
  return probability(row.poisson ?? row.poissonProbability);
}

function multiclassBrier(probabilities: BacktestProbability, actual: BacktestOutcome): number {
  return (probabilities.home - (actual === "home" ? 1 : 0)) ** 2
    + (probabilities.draw - (actual === "draw" ? 1 : 0)) ** 2
    + (probabilities.away - (actual === "away" ? 1 : 0)) ** 2;
}

function addReason(coverage: BacktestCoverage, item: BacktestExclusion): void {
  coverage.exclusions.push(item);
  coverage.reasonCounts[item.reason] = (coverage.reasonCounts[item.reason] ?? 0) + 1;
}

function baseExclusion(row: BacktestMatchRow, seenIds: Set<string>): BacktestExclusion | null {
  if (!row.id || !row.competitionId || !row.season || !row.homeTeamId || !row.awayTeamId) {
    return { rowId: row.id ?? "", reason: "incomplete-parse", detail: "row is missing a required identity field" };
  }
  if (!validDate(row.date)) return { rowId: row.id, reason: "invalid-date", detail: "row date is not a valid timestamp" };
  if (!Number.isInteger(row.round) || row.round < 1) return { rowId: row.id, reason: "invalid-round", detail: "row round must be a positive integer" };
  if (row.status && row.status !== "finished" && row.status !== "completed") return { rowId: row.id, reason: "not-completed", detail: "row is not completed" };
  if (row.completed === false || row.isCompleted === false) return { rowId: row.id, reason: "not-completed", detail: "row is not completed" };
  const regularFirstDivision = row.isRegularFirstDivision ?? (
    row.competition?.type === "league" && row.competition.tier === 1 && row.competition.phase === "regular"
  );
  if (!regularFirstDivision) {
    return { rowId: row.id, reason: "not-regular-first-division", detail: "row is not a regular first-division match" };
  }
  if (row.mapped === false || row.homeClubEloSlug === null || row.awayClubEloSlug === null) {
    return { rowId: row.id, reason: "unmapped", detail: "one or both clubs are not mapped to ClubElo" };
  }
  const actual = outcomeOf(row);
  const homeGoals = row.homeGoals;
  const awayGoals = row.awayGoals;
  if (!actual || !nonNegativeInteger(homeGoals) || !nonNegativeInteger(awayGoals)) {
    return { rowId: row.id, reason: "incomplete-parse", detail: "row has no final result" };
  }
  if (row.preMatchReliable === false || row.eloSource === "other") {
    return { rowId: row.id, reason: "unfrozen-input", detail: "pre-match input is explicitly unreliable" };
  }
  if (seenIds.has(row.id)) return { rowId: row.id, reason: "duplicate", detail: "row duplicates an earlier match" };
  for (const measuredAt of [row.homeRatingMeasuredAt, row.awayRatingMeasuredAt, row.asOf, row.availableAt]) {
    if (measuredAt && validDate(measuredAt) && dateValue(measuredAt) > dateValue(row.date)) {
      return { rowId: row.id, reason: "unfrozen-input", detail: "an input was measured or made available after kickoff" };
    }
  }
  return null;
}

export function filterBacktestRows(rows: readonly BacktestMatchRow[]): { rows: BacktestMatchRow[]; coverage: BacktestCoverage } {
  const coverage: BacktestCoverage = { suppliedRows: rows.length, eligibleRows: 0, excludedRows: 0, ratio: 0, exclusions: [], reasonCounts: {} };
  const seenIds = new Set<string>();
  const included: BacktestMatchRow[] = [];
  for (const row of rows) {
    const item = baseExclusion(row, seenIds);
    if (item) {
      addReason(coverage, item);
      continue;
    }
    seenIds.add(row.id);
    included.push(row);
  }
  coverage.eligibleRows = included.length;
  coverage.excludedRows = coverage.exclusions.length;
  coverage.ratio = rows.length === 0 ? 0 : included.length / rows.length;
  return { rows: included, coverage };
}

function uniqueSorted<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function foldPeriods(rows: readonly BacktestMatchRow[]): Array<{ competitionId: string; season: string; round: number; start: string; end: string }> {
  const groups = new Map<string, BacktestMatchRow[]>();
  for (const row of rows) {
    const key = `${row.competitionId}|${row.season}|${row.round}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .map((group) => ({
      competitionId: group[0].competitionId,
      season: group[0].season,
      round: group[0].round,
      start: group.map((row) => row.date).sort()[0],
      end: group.map((row) => row.date).sort().at(-1)!,
    }))
    .sort((a, b) => dateValue(a.start) - dateValue(b.start) || a.competitionId.localeCompare(b.competitionId) || a.season.localeCompare(b.season) || a.round - b.round);
}

function chronologicalRows(rows: readonly BacktestMatchRow[]): BacktestMatchRow[] {
  return rows.filter((row) => Boolean(row.id && row.competitionId && row.season && row.homeTeamId && row.awayTeamId && validDate(row.date) && Number.isInteger(row.round) && row.round > 0));
}

function calibrationPredictor(options: ChronologicalBacktestOptions): BacktestPredictors[BacktestModel] {
  return (row, trainingRows) => {
    const calibration = calibrateClubEloRows(trainingRows, {
      ...options.calibration,
      generatedAt: "1970-01-01T00:00:00.000Z",
      selectedBy: "chronological-backtest",
    });
    return probabilityForCalibration(calibration, row.competitionId, effectiveEloDelta(row));
  };
}

function defaults(options: ChronologicalBacktestOptions): Record<BacktestModel, BacktestPredictors[BacktestModel]> {
  return {
    "elo-monte-carlo-v1": calibrationPredictor(options),
    "clubelo-direct": (row) => modelProbability(row, "clubelo-direct"),
    bzzoiro: (row) => modelProbability(row, "bzzoiro"),
    poisson: (row) => modelProbability(row, "poisson"),
  };
}

function bucketOf(row: BacktestMatchRow): number {
  return Math.floor(effectiveEloDelta(row) / 50) * 50;
}

export function calculateMatchMetrics(predictions: readonly MatchPrediction[]): MatchMetrics {
  const byOutcome = Object.fromEntries(([
    ["home", { rows: 0, logLoss: 0, brierScore: 0 }],
    ["draw", { rows: 0, logLoss: 0, brierScore: 0 }],
    ["away", { rows: 0, logLoss: 0, brierScore: 0 }],
  ] as const).map(([outcome, value]) => [outcome, value])) as Record<BacktestOutcome, { rows: number; logLoss: number; brierScore: number }>;
  const reliability = new Map<string, { outcome: BacktestOutcome; bucket: number; rows: number; predicted: number; observed: number }>();
  const losses: MatchLossObservation[] = [];
  let logLoss = 0;
  let brierScore = 0;
  for (const prediction of predictions) {
    const p = Math.max(Number.EPSILON, prediction.probability[prediction.actual]);
    const rowLogLoss = -Math.log(p);
    const rowBrier = multiclassBrier(prediction.probability, prediction.actual);
    logLoss += rowLogLoss;
    brierScore += rowBrier;
    byOutcome[prediction.actual].rows += 1;
    byOutcome[prediction.actual].logLoss += rowLogLoss;
    byOutcome[prediction.actual].brierScore += rowBrier;
    losses.push({ rowId: prediction.rowId, season: prediction.season, logLoss: rowLogLoss, brierScore: rowBrier });
    for (const outcome of ["home", "draw", "away"] as const) {
      const key = `${outcome}|${prediction.bucket}`;
      const cell = reliability.get(key) ?? { outcome, bucket: prediction.bucket, rows: 0, predicted: 0, observed: 0 };
      cell.rows += 1;
      cell.predicted += prediction.probability[outcome];
      cell.observed += prediction.actual === outcome ? 1 : 0;
      reliability.set(key, cell);
    }
  }
  const cells = [...reliability.values()].map((cell) => {
    const predicted = cell.predicted / cell.rows;
    const observed = cell.observed / cell.rows;
    return { ...cell, predicted, observed, absoluteError: Math.abs(predicted - observed) };
  });
  return {
    rows: predictions.length,
    logLoss: predictions.length ? logLoss / predictions.length : null,
    brierScore: predictions.length ? brierScore / predictions.length : null,
    calibrationError: cells.length ? cells.reduce((sum, cell) => sum + cell.absoluteError, 0) / cells.length : null,
    byOutcome: Object.fromEntries(([
      ["home", byOutcome.home], ["draw", byOutcome.draw], ["away", byOutcome.away],
    ] as const).map(([outcome, value]) => [outcome, {
      rows: value.rows,
      logLoss: value.rows ? value.logLoss / value.rows : null,
      brierScore: value.rows ? value.brierScore / value.rows : null,
    }])) as MatchMetrics["byOutcome"],
    reliability: cells.sort((a, b) => a.bucket - b.bucket || a.outcome.localeCompare(b.outcome)),
    losses,
  };
}

export function calculateChampionMetrics(predictions: readonly ChampionPrediction[]): ChampionMetrics {
  const byClubAccumulator = new Map<string, { rows: number; logLoss: number; brierScore: number; predicted: number; observed: number }>();
  let logLoss = 0;
  let brierScore = 0;
  for (const prediction of predictions) {
    const p = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, prediction.probability));
    const rowLogLoss = prediction.actualChampion ? -Math.log(p) : -Math.log(1 - p);
    const rowBrier = (p - (prediction.actualChampion ? 1 : 0)) ** 2;
    logLoss += rowLogLoss;
    brierScore += rowBrier;
    const club = byClubAccumulator.get(prediction.clubId) ?? { rows: 0, logLoss: 0, brierScore: 0, predicted: 0, observed: 0 };
    club.rows += 1;
    club.logLoss += rowLogLoss;
    club.brierScore += rowBrier;
    club.predicted += p;
    club.observed += prediction.actualChampion ? 1 : 0;
    byClubAccumulator.set(prediction.clubId, club);
  }
  const byClub = Object.fromEntries([...byClubAccumulator.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([clubId, value]) => [clubId, {
    rows: value.rows,
    logLoss: value.logLoss / value.rows,
    brierScore: value.brierScore / value.rows,
    calibrationError: Math.abs(value.predicted / value.rows - value.observed / value.rows),
  }])) as ChampionMetrics["byClub"];
  return {
    rows: predictions.length,
    logLoss: predictions.length ? logLoss / predictions.length : null,
    brierScore: predictions.length ? brierScore / predictions.length : null,
    calibrationError: Object.keys(byClub).length ? Object.values(byClub).reduce((sum, value) => sum + (value.calibrationError ?? 0), 0) / Object.keys(byClub).length : null,
    byClub,
  };
}

interface PairedObservation {
  season: string;
  candidate: number;
  baseline: number;
}

export function pairedSeasonAwareBootstrap(
  observations: readonly PairedObservation[],
  metric: BootstrapDifference["metric"],
  options: Pick<PromotionThresholds, "confidenceLevel" | "bootstrapIterations" | "bootstrapSeed"> = DEFAULT_PROMOTION_THRESHOLDS,
): BootstrapDifference | null {
  if (!observations.length) return null;
  const seasons = uniqueSorted(observations.map((observation) => observation.season)).sort();
  const difference = (observation: PairedObservation) => observation.candidate - observation.baseline;
  const observed = observations.reduce((sum, observation) => sum + difference(observation), 0) / observations.length;
  let state = options.bootstrapSeed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const bySeason = new Map(seasons.map((season) => [season, observations.filter((observation) => observation.season === season)]));
  const samples: number[] = [];
  for (let iteration = 0; iteration < options.bootstrapIterations; iteration += 1) {
    const sampled: PairedObservation[] = [];
    for (let index = 0; index < seasons.length; index += 1) {
      sampled.push(...(bySeason.get(seasons[Math.floor(random() * seasons.length)]) ?? []));
    }
    samples.push(sampled.reduce((sum, observation) => sum + difference(observation), 0) / sampled.length);
  }
  samples.sort((a, b) => a - b);
  const alpha = (1 - options.confidenceLevel) / 2;
  const percentile = (value: number) => {
    const index = (samples.length - 1) * value;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return samples[lower] + (samples[upper] - samples[lower]) * (index - lower);
  };
  return {
    version: PROMOTION_GATE_VERSION,
    metric,
    observed,
    lower: percentile(alpha),
    upper: percentile(1 - alpha),
    confidenceLevel: options.confidenceLevel,
    iterations: options.bootstrapIterations,
    seed: options.bootstrapSeed,
    seasons,
  };
}

export const seasonAwarePairedBootstrap = pairedSeasonAwareBootstrap;

function thresholdsFor(options: Partial<PromotionThresholds> | undefined): PromotionThresholds {
  const thresholds = { ...DEFAULT_PROMOTION_THRESHOLDS, ...options };
  if (!(thresholds.minimumCoverage >= 0 && thresholds.minimumCoverage <= 1)) throw new Error("minimumCoverage must be between 0 and 1");
  if (!(thresholds.minimumCompleteSeasons >= 1)) throw new Error("minimumCompleteSeasons must be positive");
  if (!(thresholds.logLossMargin >= 0 && thresholds.brierScoreMargin >= 0 && thresholds.championCalibrationMargin >= 0)) throw new Error("promotion margins must be non-negative");
  if (!(thresholds.confidenceLevel > 0 && thresholds.confidenceLevel < 1)) throw new Error("confidenceLevel must be between 0 and 1");
  if (!Number.isInteger(thresholds.bootstrapIterations) || thresholds.bootstrapIterations < 100) throw new Error("bootstrapIterations must be at least 100");
  return thresholds;
}

export function evaluatePromotionGate(input: PromotionGateInput): PromotionDecision {
  const thresholds = thresholdsFor(input.thresholds);
  const reasons: string[] = [];
  const coveragePassed = input.coverage >= thresholds.minimumCoverage;
  const historyPassed = input.completeSeasons >= thresholds.minimumCompleteSeasons;
  if (!coveragePassed) reasons.push("insufficient-coverage");
  if (!historyPassed) reasons.push("insufficient-complete-seasons");
  if (!input.matchLogLoss || input.matchLogLoss.upper > thresholds.logLossMargin) reasons.push("log-loss-non-inferiority-failed");
  if (!input.matchBrierScore || input.matchBrierScore.upper > thresholds.brierScoreMargin) reasons.push("brier-non-inferiority-failed");
  if (!input.championCalibration || input.championCalibration.upper > thresholds.championCalibrationMargin) reasons.push("champion-calibration-failed");
  if (input.championCalibrationAbsolute === undefined || input.championCalibrationAbsolute === null || input.championCalibrationAbsolute > thresholds.championCalibrationMargin) reasons.push("champion-calibration-threshold-failed");
  const backtestPassed = reasons.length === 0;
  const reproducibilityPassed = input.reproducible;
  if (!reproducibilityPassed) reasons.push("exact-reproducibility-failed");
  const shadowRunPassed = Boolean(
    input.shadowRun?.verified
      && input.shadowRun.runId
      && input.shadowRun.inputHash
      && input.shadowRun.datasetVersion
      && input.shadowRun.inputHash === input.shadowRunInputHash
      && input.shadowRun.datasetVersion === input.datasetVersion
      && input.shadowRun.completed
      && input.shadowRun.fullRound
      && input.shadowRun.dataQualityErrors.length === 0,
  );
  if (!shadowRunPassed) reasons.push("controlled-shadow-run-failed");
  return {
    gateVersion: PROMOTION_GATE_VERSION,
    thresholdVersion: thresholds.version,
    passed: backtestPassed && reproducibilityPassed && shadowRunPassed,
    backtestPassed,
    reproducibilityPassed,
    shadowRunPassed,
    status: !backtestPassed ? "provisional" : backtestPassed && reproducibilityPassed && shadowRunPassed ? "production" : "shadow",
    reasons,
  };
}

export interface ModelStatusChecks {
  historySufficient: boolean;
  coverageSufficient: boolean;
  backtestPassed: boolean;
  reproducibilityPassed: boolean;
  shadowRunPassed: boolean;
}

export function transitionModelStatus(
  current: PromotionDecision["status"],
  requested: PromotionDecision["status"],
  checks: ModelStatusChecks,
): PromotionDecision["status"] {
  if (!checks.historySufficient || !checks.coverageSufficient) return "provisional";
  if (requested === "provisional") return "provisional";
  if (requested === "shadow") {
    if (!checks.backtestPassed) throw new Error("model cannot enter shadow without a passing backtest");
    return "shadow";
  }
  if (current !== "shadow" || !checks.backtestPassed || !checks.reproducibilityPassed || !checks.shadowRunPassed) {
    throw new Error("model cannot enter production without a passing backtest, exact reproducibility, and a clean full-round shadow run");
  }
  return "production";
}

function reportInput(rows: readonly BacktestMatchRow[], options: ChronologicalBacktestOptions): string {
  const stableOptions = { ...options };
  delete stableOptions.generatedAt;
  delete stableOptions.predictors;
  delete stableOptions.reproducible;
  delete stableOptions.shadowRun;
  return hash({ rows, options: stableOptions, predictorNames: Object.keys(options.predictors ?? {}).sort() });
}

export function runChronologicalBacktest(
  suppliedRows: readonly BacktestMatchRow[],
  options: ChronologicalBacktestOptions,
): ChronologicalBacktestReport {
  if (!options.datasetVersion) throw new Error("datasetVersion is required");
  const models = uniqueSorted(options.models ?? ["elo-monte-carlo-v1", "clubelo-direct", "bzzoiro", "poisson"] as const) as BacktestModel[];
  const baseline = options.baseline ?? "bzzoiro";
  if (!models.includes(baseline) || !models.includes("elo-monte-carlo-v1")) throw new Error("baseline and elo-monte-carlo-v1 must be included in models");
  const { rows, coverage: sourceCoverage } = filterBacktestRows(suppliedRows);
  const periods = foldPeriods(chronologicalRows(suppliedRows));
  const sourceExclusionsById = new Map(sourceCoverage.exclusions.map((item) => [item.rowId, item]));
  const predictors = { ...defaults(options), ...options.predictors } as Record<BacktestModel, BacktestPredictors[BacktestModel]>;
  const folds: BacktestFold[] = [];
  const allPredictions = new Map<BacktestModel, MatchPrediction[]>();
  const allChampionPredictions = new Map<BacktestModel, ChampionPrediction[]>();
  for (const model of models) {
    allPredictions.set(model, []);
    allChampionPredictions.set(model, []);
  }
  const minimumTrainingRows = options.minimumTrainingRows ?? 1;
  for (const period of periods) {
    const trainingRows = rows.filter((row) => dateValue(row.date) < dateValue(period.start));
    if (trainingRows.length < minimumTrainingRows) continue;
    const testRows = chronologicalRows(suppliedRows).filter((row) => row.competitionId === period.competitionId && row.season === period.season && row.round === period.round);
    const foldCoverage: BacktestCoverage = { suppliedRows: testRows.length, eligibleRows: 0, excludedRows: 0, ratio: 0, exclusions: [], reasonCounts: {} };
    const foldPredictions = new Map<BacktestModel, MatchPrediction[]>();
    for (const model of models) foldPredictions.set(model, []);
    for (const row of testRows) {
      const sourceExclusion = sourceExclusionsById.get(row.id);
      if (sourceExclusion) {
        addReason(foldCoverage, sourceExclusion);
        continue;
      }
      if (hasFutureInput(row, period.start)) {
        addReason(foldCoverage, { rowId: row.id, reason: "unfrozen-input", detail: "an input was not available at the frozen test-period boundary" });
        continue;
      }
      const missing: BacktestModel[] = [];
      const probabilities = new Map<BacktestModel, BacktestProbability>();
      for (const model of models) {
        let predicted: BacktestProbability | null = null;
        try {
          predicted = probability(predictors[model](row, trainingRows));
        } catch {
          predicted = null;
        }
        if (!predicted) missing.push(model);
        else probabilities.set(model, predicted);
      }
      if (missing.length) {
        addReason(foldCoverage, { rowId: row.id, reason: "missing-model-prediction", detail: "row did not produce a valid prediction for every compared model", models: missing });
        continue;
      }
      const actual = outcomeOf(row)!;
      foldCoverage.eligibleRows += 1;
      for (const model of models) {
        foldPredictions.get(model)!.push({ rowId: row.id, competitionId: row.competitionId, season: row.season, round: row.round, bucket: bucketOf(row), actual, probability: probabilities.get(model)! });
        allPredictions.get(model)!.push(foldPredictions.get(model)!.at(-1)!);
      }
    }
    foldCoverage.excludedRows = foldCoverage.exclusions.length;
    foldCoverage.ratio = testRows.length === 0 ? 0 : foldCoverage.eligibleRows / testRows.length;
    const metrics = Object.fromEntries(models.map((model) => [model, calculateMatchMetrics(foldPredictions.get(model)!)])) as Record<BacktestModel, MatchMetrics | null>;
    const championMetrics: Partial<Record<BacktestModel, ChampionMetrics>> = {};
    for (const model of models) {
      const championPredictions = (options.championRows ?? []).filter((row) => row.competitionId === period.competitionId && row.season === period.season && row.round === period.round && validDate(row.date) && ![row.asOf, row.availableAt].some((value) => value && validDate(value) && dateValue(value) > dateValue(period.start)))
        .map((row) => ({ id: row.id, competitionId: row.competitionId, season: row.season, clubId: row.clubId, actualChampion: row.actualChampion, probability: row.probabilities[model] }))
        .filter((row): row is ChampionPrediction => finite(row.probability));
      if (championPredictions.length) {
        championMetrics[model] = calculateChampionMetrics(championPredictions);
        allChampionPredictions.get(model)!.push(...championPredictions);
      }
    }
    const trainingThrough = trainingRows.map((row) => row.date).sort().at(-1) ?? null;
    const futureMeasuredRatings = trainingRows.filter((row) => [row.homeRatingMeasuredAt, row.awayRatingMeasuredAt].some((value) => value && validDate(value) && dateValue(value) >= dateValue(period.start))).length;
    const futureAsOfInputs = trainingRows.filter((row) => [row.asOf, row.availableAt].some((value) => value && validDate(value) && dateValue(value) >= dateValue(period.start))).length;
    folds.push({
      id: `${period.competitionId}-${period.season}-round-${period.round}`,
      competitionId: period.competitionId,
      season: period.season,
      round: period.round,
      testStartsAt: period.start,
      testEndsAt: period.end,
      frozenAsOf: period.start,
      trainingRows: trainingRows.length,
      trainingThrough,
      testRows: testRows.length,
      eligibleRows: foldCoverage.eligibleRows,
      coverage: foldCoverage,
      leakage: { passed: trainingRows.every((row) => dateValue(row.date) < dateValue(period.start)) && futureMeasuredRatings === 0 && futureAsOfInputs === 0, trainingRowsAtOrAfterTestStart: trainingRows.filter((row) => dateValue(row.date) >= dateValue(period.start)).length, futureMeasuredRatings, futureAsOfInputs },
      metrics,
      championMetrics,
    });
  }
  const modelReports = {} as Record<BacktestModel, BacktestModelReport>;
  for (const model of models) {
    const predictions = allPredictions.get(model)!;
    modelReports[model] = { rows: predictions.length, match: calculateMatchMetrics(predictions), champion: allChampionPredictions.get(model)!.length ? calculateChampionMetrics(allChampionPredictions.get(model)!) : null };
  }
  const thresholds = thresholdsFor(options.thresholds);
  const inputHash = reportInput(suppliedRows, options);
  const candidatePredictions = allPredictions.get("elo-monte-carlo-v1")!;
  const baselinePredictions = allPredictions.get(baseline)!;
  const baselineById = new Map(baselinePredictions.map((prediction) => [prediction.rowId, prediction]));
  const paired = candidatePredictions.flatMap((candidate) => {
    const base = baselineById.get(candidate.rowId);
    return base ? [{ season: candidate.season, candidate: -Math.log(Math.max(Number.EPSILON, candidate.probability[candidate.actual])), baseline: -Math.log(Math.max(Number.EPSILON, base.probability[base.actual])) }] : [];
  });
  const pairedBrier = candidatePredictions.flatMap((candidate) => {
    const base = baselineById.get(candidate.rowId);
    if (!base) return [];
    const candidateBrier = multiclassBrier(candidate.probability, candidate.actual);
    const baselineBrier = multiclassBrier(base.probability, base.actual);
    return [{ season: candidate.season, candidate: candidateBrier, baseline: baselineBrier }];
  });
  const candidateChampion = allChampionPredictions.get("elo-monte-carlo-v1")!;
  const baselineChampion = allChampionPredictions.get(baseline)!;
  const baselineChampionById = new Map(baselineChampion.map((prediction) => [prediction.id, prediction]));
  const championPaired = candidateChampion.flatMap((candidate) => {
    const base = baselineChampionById.get(candidate.id);
    return base ? [{ season: candidate.season, candidate: Math.abs(candidate.probability - (candidate.actualChampion ? 1 : 0)), baseline: Math.abs(base.probability - (base.actualChampion ? 1 : 0)) }] : [];
  });
  const bootstrapOptions = { confidenceLevel: thresholds.confidenceLevel, bootstrapIterations: thresholds.bootstrapIterations, bootstrapSeed: thresholds.bootstrapSeed };
  const bootstrap: ChronologicalBacktestReport["bootstrap"] = {};
  const logLoss = pairedSeasonAwareBootstrap(paired, "logLoss", bootstrapOptions);
  const brierScore = pairedSeasonAwareBootstrap(pairedBrier, "brierScore", bootstrapOptions);
  const championCalibration = pairedSeasonAwareBootstrap(championPaired, "calibrationError", bootstrapOptions);
  if (logLoss) bootstrap.logLoss = logLoss;
  if (brierScore) bootstrap.brierScore = brierScore;
  if (championCalibration) bootstrap.championCalibration = championCalibration;
  const evidencedCompleteSeasons = uniqueSorted(rows.map((row) => row.season)).filter((season) => {
    const seasonRows = rows.filter((row) => row.season === season);
    return seasonRows.length > 0 && seasonRows.every((row) => row.seasonComplete === true);
  });
  const completeSeasonSet = new Set(options.completeSeasons?.filter((season) => evidencedCompleteSeasons.includes(season)) ?? evidencedCompleteSeasons);
  const completeSeasons = completeSeasonSet.size;
  const sharedCoverage = suppliedRows.length === 0 ? 0 : candidatePredictions.length / suppliedRows.length;
  const candidateChampionMetrics = modelReports["elo-monte-carlo-v1"]?.champion;
  const promotion = evaluatePromotionGate({ candidate: "elo-monte-carlo-v1", baseline, thresholds, coverage: sharedCoverage, completeSeasons, matchLogLoss: logLoss, matchBrierScore: brierScore, championCalibration, championCalibrationAbsolute: candidateChampionMetrics?.calibrationError, reproducible: options.reproducible ?? false, shadowRun: options.shadowRun, shadowRunInputHash: inputHash, datasetVersion: options.datasetVersion });
  const content = {
    schemaVersion: BACKTEST_SCHEMA_VERSION,
    reportVersion: BACKTEST_REPORT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    datasetVersion: options.datasetVersion,
    baseline,
    models: modelReports,
    folds,
    coverage: { suppliedRows: sourceCoverage.suppliedRows, eligibleRows: candidatePredictions.length, ratio: sharedCoverage, excludedRows: sourceCoverage.suppliedRows - candidatePredictions.length, reasonCounts: Object.fromEntries([...sourceCoverage.exclusions, ...folds.flatMap((fold) => fold.coverage.exclusions).filter((item) => item.reason === "missing-model-prediction" || item.reason === "invalid-model-prediction")].reduce((counts, item) => counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1), new Map<BacktestExclusion["reason"], number>())) },
    bootstrap,
    thresholds,
    promotion,
    reproducibility: { inputHash, outputHash: hash({ modelReports, folds, bootstrap, promotion }), exact: options.reproducible ?? false },
  };
  return { ...content, reportId: `backtest-${hash(content).slice(0, 16)}` };
}

/** Run the deterministic workflow twice; promotion callers should require this before production. */
export function verifyBacktestReproducibility(
  rows: readonly BacktestMatchRow[],
  options: ChronologicalBacktestOptions,
): boolean {
  const verificationOptions = { ...options, reproducible: false };
  const first = runChronologicalBacktest(rows, verificationOptions);
  const second = runChronologicalBacktest(rows, verificationOptions);
  return first.reproducibility.inputHash === second.reproducibility.inputHash
    && first.reproducibility.outputHash === second.reproducibility.outputHash;
}
