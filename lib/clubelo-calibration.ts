import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CLUB_ELO_CALIBRATION_SCHEMA_VERSION = 1 as const;
export const CLUB_ELO_CALIBRATION_MODEL_VERSION = "elo-calibration-v1" as const;
export const CLUB_ELO_CALIBRATION_VERSION = "clubelo-calibration-v1" as const;
export const CALIBRATION_BUCKET_WIDTH = 50;

export type CalibrationOutcome = "home" | "draw" | "away";
export type CalibrationStatus = "provisional" | "calibrated";

export interface CalibrationCompetitionDescriptor {
  type: "league" | "cup" | "friendly" | "playoff" | "other";
  tier: number;
  phase: "regular" | "playoff" | "group" | "other";
}

/**
 * The calibrator accepts normalized historical rows. Provider adapters should
 * map their DTOs to this shape before entering the model boundary.
 */
export interface HistoricalCalibrationRow {
  id: string;
  competitionId: string;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  competition?: CalibrationCompetitionDescriptor;
  competitionType?: CalibrationCompetitionDescriptor["type"];
  competitionTier?: number;
  competitionPhase?: CalibrationCompetitionDescriptor["phase"];
  isRegularFirstDivision?: boolean;
  status?: "finished" | "completed" | "scheduled" | "postponed" | "cancelled";
  completed?: boolean;
  isCompleted?: boolean;
  homeGoals?: number;
  awayGoals?: number;
  mapped?: boolean;
  homeClubEloSlug?: string | null;
  awayClubEloSlug?: string | null;
  date?: string;
  playedAt?: string;
  preMatchReliable?: boolean;
  eloSource?: "clubelo" | "other";
  homeRatingMeasuredAt?: string;
  awayRatingMeasuredAt?: string;
  homeElo?: number;
  awayElo?: number;
  homeAdvantage?: number;
  preMatch?: {
    homeElo: number;
    awayElo: number;
    homeAdvantage: number;
  };
  seasonComplete?: boolean;
}

export type CalibrationExclusionReason =
  | "not-completed"
  | "not-regular-first-division"
  | "duplicate"
  | "incomplete-parse"
  | "unreliable-pre-match"
  | "missing-final-score"
  | "unmapped";

export interface CalibrationExclusion {
  rowId: string;
  competitionId?: string;
  season?: string;
  reason: CalibrationExclusionReason;
  detail: string;
}

export interface CalibrationFilterCoverage {
  suppliedRows: number;
  eligibleRows: number;
  includedRows: number;
  excludedRows: number;
  ratio: number;
  mappedRows: number;
  seasons: number;
  fullSeasons: number;
}

export interface CalibrationFilterReport {
  includedRows: HistoricalCalibrationRow[];
  exclusions: CalibrationExclusion[];
  reasonCounts: Partial<Record<CalibrationExclusionReason, number>>;
  coverage: CalibrationFilterCoverage;
}

export interface CalibrationParameters {
  bucketWidth: typeof CALIBRATION_BUCKET_WIDTH;
  seasonDecayFactor: number;
  poolingFactor: number;
  minimumEffectiveObservations: number;
  selectedBy: "configured" | "chronological-backtest";
  selectionDatasetVersion?: string;
}

export interface CalibrationFilterOptions {
  mappedTeamIds?: ReadonlySet<string>;
  mappedCompetitionIds?: ReadonlySet<string>;
  fullSeasons?: readonly string[];
  minimumRowsPerFullSeason?: number;
}

export interface CalibrationBuildOptions extends CalibrationFilterOptions {
  datasetVersion?: string;
  modelVersion?: string;
  calibrationVersion?: string;
  generatedAt?: string;
  seasonOrder?: readonly string[];
  seasonDecayFactor?: number;
  poolingFactor?: number;
  minimumEffectiveObservations?: number;
  selectedBy?: CalibrationParameters["selectedBy"];
  selectionDatasetVersion?: string;
}

export interface CalibrationProbability {
  home: number;
  draw: number;
  away: number;
}

export interface CalibrationBucket {
  lowerBound: number;
  upperBound: number;
  observations: number;
  weightedObservations: number;
  effectiveObservations: number;
  poolingWeight: number;
  rawProbability: CalibrationProbability;
  priorProbability: CalibrationProbability;
  probability: CalibrationProbability;
  thin: boolean;
}

export interface CalibrationMetrics {
  rows: number;
  weightedRows: number;
  effectiveObservations: number;
  logLoss: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  bucketCalibration: Array<{
    lowerBound: number;
    rows: number;
    weightedRows: number;
    predicted: CalibrationProbability;
    observed: CalibrationProbability;
    absoluteError: number;
  }>;
  byOutcome: Record<CalibrationOutcome, { rows: number; logLoss: number | null; brierScore: number | null }>;
}

export interface CalibrationArtifactCoverage extends CalibrationFilterCoverage {
  includedSeasons: string[];
  completeSeasons: string[];
  bucketCount: number;
  effectiveObservations: number;
  reasonCounts: Partial<Record<CalibrationExclusionReason, number>>;
}

export interface CalibrationArtifact {
  schemaVersion: typeof CLUB_ELO_CALIBRATION_SCHEMA_VERSION;
  artifactId: string;
  artifactKind: "general-prior" | "competition";
  competitionId: string | null;
  datasetVersion: string;
  modelVersion: string;
  calibrationVersion: string;
  generatedAt: string;
  includedSeasons: string[];
  includedRows: number;
  status: CalibrationStatus;
  provisional: boolean;
  provisionalReasons: string[];
  parameters: CalibrationParameters;
  buckets: CalibrationBucket[];
  overallProbability: CalibrationProbability;
  metrics: CalibrationMetrics;
  coverage: CalibrationArtifactCoverage;
}

export interface CalibrationArtifactSet {
  schemaVersion: typeof CLUB_ELO_CALIBRATION_SCHEMA_VERSION;
  datasetVersion: string;
  modelVersion: string;
  calibrationVersion: string;
  generatedAt: string;
  parameters: CalibrationParameters;
  filterReport: CalibrationFilterReport;
  generalPrior: CalibrationArtifact;
  competitions: Record<string, CalibrationArtifact>;
}

export interface CalibrationArtifactStore {
  save(artifact: CalibrationArtifact): Promise<void>;
}

export class FileCalibrationArtifactStore implements CalibrationArtifactStore {
  constructor(private readonly directory: string) {}

  async save(artifact: CalibrationArtifact): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const competition = artifact.competitionId ?? "general-prior";
    const safeCompetition = competition.replace(/[^A-Za-z0-9_-]/g, "_");
    const safeDataset = artifact.datasetVersion.replace(/[^A-Za-z0-9_-]/g, "_");
    const safeCalibration = artifact.calibrationVersion.replace(/[^A-Za-z0-9_-]/g, "_");
    const path = join(this.directory, `${safeCompetition}-${safeDataset}-${safeCalibration}.json`);
    const temporaryPath = `${path}.${artifact.artifactId}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  }
}

interface WeightedRow {
  row: HistoricalCalibrationRow;
  delta: number;
  outcome: CalibrationOutcome;
  weight: number;
  bucket: number;
}

const DEFAULT_SEASON_DECAY_FACTOR = 0.8;
const DEFAULT_POOLING_FACTOR = 50;
const DEFAULT_MINIMUM_EFFECTIVE_OBSERVATIONS = 30;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function exclusion(
  row: HistoricalCalibrationRow,
  reason: CalibrationExclusionReason,
  detail: string,
): CalibrationExclusion {
  return { rowId: row.id, competitionId: row.competitionId, season: row.season, reason, detail };
}

function addReason(report: CalibrationFilterReport, item: CalibrationExclusion): void {
  report.exclusions.push(item);
  report.reasonCounts[item.reason] = (report.reasonCounts[item.reason] ?? 0) + 1;
}

function descriptorOf(row: HistoricalCalibrationRow): CalibrationCompetitionDescriptor | null {
  if (row.competition) return row.competition;
  if (row.competitionType && finite(row.competitionTier) && row.competitionPhase) {
    return { type: row.competitionType, tier: row.competitionTier, phase: row.competitionPhase };
  }
  return null;
}

function isRegularFirstDivision(row: HistoricalCalibrationRow): boolean {
  if (row.isRegularFirstDivision !== undefined) return row.isRegularFirstDivision;
  const descriptor = descriptorOf(row);
  return descriptor?.type === "league" && descriptor.tier === 1 && descriptor.phase === "regular";
}

function isCompleted(row: HistoricalCalibrationRow): boolean {
  if (row.completed === true || row.isCompleted === true) return true;
  if (row.status === "finished" || row.status === "completed") return true;
  if (row.status !== undefined) return false;
  return nonNegativeInteger(row.homeGoals) && nonNegativeInteger(row.awayGoals);
}

function isMapped(row: HistoricalCalibrationRow, options: CalibrationFilterOptions): boolean {
  if (row.mapped === false || row.homeClubEloSlug === null || row.awayClubEloSlug === null) return false;
  if (options.mappedCompetitionIds && !options.mappedCompetitionIds.has(row.competitionId)) return false;
  if (options.mappedTeamIds && (!options.mappedTeamIds.has(row.homeTeamId) || !options.mappedTeamIds.has(row.awayTeamId))) return false;
  return true;
}

function hasReliablePreMatchFields(row: HistoricalCalibrationRow): boolean {
  if (row.preMatchReliable === false || row.eloSource === "other") return false;
  const playedAt = row.playedAt ?? row.date;
  if (playedAt) {
    const playedTime = Date.parse(playedAt);
    if (!Number.isNaN(playedTime)) {
      for (const measuredAt of [row.homeRatingMeasuredAt, row.awayRatingMeasuredAt]) {
        if (measuredAt && !Number.isNaN(Date.parse(measuredAt)) && Date.parse(measuredAt) > playedTime) return false;
      }
    }
  }
  return true;
}

function hasCompletePreMatchFields(row: HistoricalCalibrationRow): boolean {
  const fields = row.preMatch ?? row;
  return finite(fields.homeElo) && finite(fields.awayElo) && finite(fields.homeAdvantage);
}

function hasFinalScore(row: HistoricalCalibrationRow): boolean {
  return nonNegativeInteger(row.homeGoals) && nonNegativeInteger(row.awayGoals);
}

function rowKey(row: HistoricalCalibrationRow): string {
  return [row.competitionId, row.season, row.homeTeamId, row.awayTeamId, row.date ?? row.playedAt ?? ""].join("|");
}

function fullSeasonSet(rows: readonly HistoricalCalibrationRow[], options: CalibrationFilterOptions): Set<string> {
  if (options.fullSeasons) return new Set(options.fullSeasons);
  const counts = new Map<string, number>();
  const incomplete = new Set<string>();
  for (const row of rows) {
    counts.set(row.season, (counts.get(row.season) ?? 0) + 1);
    if (row.seasonComplete === false) incomplete.add(row.season);
  }
  const minimumRows = options.minimumRowsPerFullSeason ?? 1;
  return new Set([...counts.entries()]
    .filter(([season, count]) => count >= minimumRows && !incomplete.has(season))
    .map(([season]) => season));
}

export function filterCalibrationRows(
  rows: readonly HistoricalCalibrationRow[],
  options: CalibrationFilterOptions = {},
): CalibrationFilterReport {
  const report: CalibrationFilterReport = {
    includedRows: [],
    exclusions: [],
    reasonCounts: {},
    coverage: { suppliedRows: rows.length, eligibleRows: 0, includedRows: 0, excludedRows: 0, ratio: 0, mappedRows: 0, seasons: 0, fullSeasons: 0 },
  };
  const seenIds = new Set<string>();
  const seenRows = new Set<string>();
  const eligibleSeasons = new Set<string>();
  const includedSeasons = new Set<string>();

  for (const row of rows) {
    let item: CalibrationExclusion | null = null;
    if (!row.id || !row.competitionId || !row.season || !row.homeTeamId || !row.awayTeamId) {
      item = exclusion(row, "incomplete-parse", "missing a required identity field");
    } else if (!isCompleted(row)) {
      item = exclusion(row, "not-completed", "row is not a completed match");
    } else if (!isRegularFirstDivision(row)) {
      item = exclusion(row, "not-regular-first-division", "row is not a regular first-division league match");
    } else if (seenIds.has(row.id) || seenRows.has(rowKey(row))) {
      item = exclusion(row, "duplicate", "row duplicates an earlier match");
    } else if (!hasCompletePreMatchFields(row)) {
      item = exclusion(row, "incomplete-parse", "row has no complete pre-match Elo context");
    } else if (!hasReliablePreMatchFields(row)) {
      item = exclusion(row, "unreliable-pre-match", "pre-match Elo context is missing, post-match, or marked unreliable");
    } else if (!hasFinalScore(row)) {
      item = exclusion(row, "missing-final-score", "row has no real non-negative integer final score");
    } else if (!isMapped(row, options)) {
      item = exclusion(row, "unmapped", "one or both clubs are not mapped to ClubElo");
    }

    if (item) {
      addReason(report, item);
      continue;
    }
    seenIds.add(row.id);
    seenRows.add(rowKey(row));
    eligibleSeasons.add(row.season);
    if (isMapped(row, options)) report.coverage.mappedRows += 1;
    report.coverage.eligibleRows += 1;
    report.includedRows.push(row);
    includedSeasons.add(row.season);
  }

  const completeSeasons = fullSeasonSet(report.includedRows, options);
  report.coverage.includedRows = report.includedRows.length;
  report.coverage.excludedRows = report.exclusions.length;
  report.coverage.ratio = rows.length === 0 ? 0 : report.includedRows.length / rows.length;
  report.coverage.seasons = eligibleSeasons.size || includedSeasons.size;
  report.coverage.fullSeasons = [...completeSeasons].filter((season) => includedSeasons.has(season)).length;
  return report;
}

function seasonOrdering(rows: readonly HistoricalCalibrationRow[], options: CalibrationBuildOptions): string[] {
  const seasons = new Set(rows.map((row) => row.season));
  if (options.seasonOrder) {
    const specified = options.seasonOrder.filter((season) => seasons.has(season));
    const remaining = [...seasons].filter((season) => !specified.includes(season)).sort();
    return [...specified, ...remaining];
  }
  return [...seasons].sort();
}

function assertParameters(options: CalibrationBuildOptions): CalibrationParameters {
  const seasonDecayFactor = options.seasonDecayFactor ?? DEFAULT_SEASON_DECAY_FACTOR;
  const poolingFactor = options.poolingFactor ?? DEFAULT_POOLING_FACTOR;
  const minimumEffectiveObservations = options.minimumEffectiveObservations ?? DEFAULT_MINIMUM_EFFECTIVE_OBSERVATIONS;
  if (!(seasonDecayFactor > 0 && seasonDecayFactor <= 1)) throw new Error("seasonDecayFactor must be greater than 0 and at most 1");
  if (!(poolingFactor >= 0 && Number.isFinite(poolingFactor))) throw new Error("poolingFactor must be non-negative");
  if (!(minimumEffectiveObservations >= 0 && Number.isFinite(minimumEffectiveObservations))) throw new Error("minimumEffectiveObservations must be non-negative");
  return {
    bucketWidth: CALIBRATION_BUCKET_WIDTH,
    seasonDecayFactor,
    poolingFactor,
    minimumEffectiveObservations,
    selectedBy: options.selectedBy ?? "configured",
    ...(options.selectionDatasetVersion ? { selectionDatasetVersion: options.selectionDatasetVersion } : {}),
  };
}

export function effectiveEloDelta(row: HistoricalCalibrationRow): number {
  const fields = row.preMatch ?? row;
  if (!finite(fields.homeElo) || !finite(fields.awayElo) || !finite(fields.homeAdvantage)) {
    throw new Error(`row ${row.id} has no complete pre-match Elo context`);
  }
  return fields.homeElo + fields.homeAdvantage - fields.awayElo;
}

export function bucketLowerBound(delta: number): number {
  if (!Number.isFinite(delta)) throw new Error("Elo delta must be finite");
  return Math.floor(delta / CALIBRATION_BUCKET_WIDTH) * CALIBRATION_BUCKET_WIDTH;
}

function outcomeOf(row: HistoricalCalibrationRow): CalibrationOutcome {
  if (row.homeGoals! > row.awayGoals!) return "home";
  if (row.homeGoals! < row.awayGoals!) return "away";
  return "draw";
}

function normalize(probability: CalibrationProbability): CalibrationProbability {
  const clipped = {
    home: Math.max(0, probability.home),
    draw: Math.max(0, probability.draw),
    away: Math.max(0, probability.away),
  };
  const total = clipped.home + clipped.draw + clipped.away;
  if (total === 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: clipped.home / total, draw: clipped.draw / total, away: clipped.away / total };
}

function zeroProbability(): CalibrationProbability {
  return { home: 0, draw: 0, away: 0 };
}

function addOutcome(target: CalibrationProbability, outcome: CalibrationOutcome, amount: number): void {
  target[outcome] += amount;
}

function effectiveObservations(weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const squares = weights.reduce((sum, weight) => sum + weight * weight, 0);
  return squares === 0 ? 0 : (total * total) / squares;
}

function probabilityAtBuckets(buckets: readonly CalibrationBucket[], delta: number, fallback: CalibrationProbability): CalibrationProbability {
  if (buckets.length === 0) return normalize(fallback);
  const ordered = [...buckets].sort((a, b) => a.lowerBound - b.lowerBound);
  if (delta <= ordered[0].lowerBound) return normalize(ordered[0].probability);
  const last = ordered[ordered.length - 1];
  if (delta >= last.lowerBound) return normalize(last.probability);
  for (let index = 1; index < ordered.length; index += 1) {
    const upper = ordered[index];
    const lower = ordered[index - 1];
    if (delta <= upper.lowerBound) {
      const span = upper.lowerBound - lower.lowerBound;
      const ratio = span === 0 ? 0 : (delta - lower.lowerBound) / span;
      return normalize({
        home: lower.probability.home + ratio * (upper.probability.home - lower.probability.home),
        draw: lower.probability.draw + ratio * (upper.probability.draw - lower.probability.draw),
        away: lower.probability.away + ratio * (upper.probability.away - lower.probability.away),
      });
    }
  }
  return normalize(fallback);
}

function overallProbability(rows: readonly WeightedRow[]): CalibrationProbability {
  const counts = zeroProbability();
  let total = 0;
  for (const weighted of rows) {
    addOutcome(counts, weighted.outcome, weighted.weight);
    total += weighted.weight;
  }
  return total === 0 ? { home: 1 / 3, draw: 1 / 3, away: 1 / 3 } : normalize({ home: counts.home / total, draw: counts.draw / total, away: counts.away / total });
}

function metricForRows(rows: readonly WeightedRow[], probability: (delta: number) => CalibrationProbability): CalibrationMetrics {
  const byOutcome: Record<CalibrationOutcome, { rows: number; logLoss: number | null; brierScore: number | null }> = {
    home: { rows: 0, logLoss: null, brierScore: null },
    draw: { rows: 0, logLoss: null, brierScore: null },
    away: { rows: 0, logLoss: null, brierScore: null },
  };
  let weightedRows = 0;
  let logLoss = 0;
  let brierScore = 0;
  const outcomeLosses: Record<CalibrationOutcome, { logLoss: number; brierScore: number; weight: number }> = {
    home: { logLoss: 0, brierScore: 0, weight: 0 },
    draw: { logLoss: 0, brierScore: 0, weight: 0 },
    away: { logLoss: 0, brierScore: 0, weight: 0 },
  };
  const bucketMetrics = new Map<number, {
    rows: number;
    weightedRows: number;
    predicted: CalibrationProbability;
    observed: CalibrationProbability;
  }>();
  for (const weighted of rows) {
    const probabilities = probability(weighted.delta);
    const actual = weighted.outcome;
    const p = Math.max(Number.EPSILON, probabilities[actual]);
    const rowLogLoss = -Math.log(p);
    const rowBrier = (probabilities.home - (actual === "home" ? 1 : 0)) ** 2
      + (probabilities.draw - (actual === "draw" ? 1 : 0)) ** 2
      + (probabilities.away - (actual === "away" ? 1 : 0)) ** 2;
    weightedRows += weighted.weight;
    logLoss += weighted.weight * rowLogLoss;
    brierScore += weighted.weight * rowBrier;
    outcomeLosses[actual].weight += weighted.weight;
    outcomeLosses[actual].logLoss += weighted.weight * rowLogLoss;
    outcomeLosses[actual].brierScore += weighted.weight * rowBrier;
    const metric = bucketMetrics.get(weighted.bucket) ?? {
      rows: 0,
      weightedRows: 0,
      predicted: zeroProbability(),
      observed: zeroProbability(),
    };
    metric.rows += 1;
    metric.weightedRows += weighted.weight;
    metric.predicted.home += weighted.weight * probabilities.home;
    metric.predicted.draw += weighted.weight * probabilities.draw;
    metric.predicted.away += weighted.weight * probabilities.away;
    addOutcome(metric.observed, actual, weighted.weight);
    bucketMetrics.set(weighted.bucket, metric);
  }
  for (const outcome of ["home", "draw", "away"] as const) {
    const loss = outcomeLosses[outcome];
    byOutcome[outcome] = {
      rows: rows.filter((weighted) => weighted.outcome === outcome).length,
      logLoss: loss.weight === 0 ? null : loss.logLoss / loss.weight,
      brierScore: loss.weight === 0 ? null : loss.brierScore / loss.weight,
    };
  }
  const bucketCalibration = [...bucketMetrics.entries()].sort(([a], [b]) => a - b).map(([lowerBound, metric]) => {
    const predicted = normalize({
      home: metric.predicted.home / metric.weightedRows,
      draw: metric.predicted.draw / metric.weightedRows,
      away: metric.predicted.away / metric.weightedRows,
    });
    const observed = normalize({
      home: metric.observed.home / metric.weightedRows,
      draw: metric.observed.draw / metric.weightedRows,
      away: metric.observed.away / metric.weightedRows,
    });
    const absoluteError = (Math.abs(predicted.home - observed.home)
      + Math.abs(predicted.draw - observed.draw)
      + Math.abs(predicted.away - observed.away)) / 3;
    return { lowerBound, rows: metric.rows, weightedRows: metric.weightedRows, predicted, observed, absoluteError };
  });
  const calibrationWeight = bucketCalibration.reduce((sum, bucket) => sum + bucket.weightedRows, 0);
  return {
    rows: rows.length,
    weightedRows,
    effectiveObservations: effectiveObservations(rows.map((weighted) => weighted.weight)),
    logLoss: weightedRows === 0 ? null : logLoss / weightedRows,
    brierScore: weightedRows === 0 ? null : brierScore / weightedRows,
    calibrationError: calibrationWeight === 0
      ? null
      : bucketCalibration.reduce((sum, bucket) => sum + bucket.weightedRows * bucket.absoluteError, 0) / calibrationWeight,
    bucketCalibration,
    byOutcome,
  };
}

function canonicalRows(rows: readonly HistoricalCalibrationRow[]): string {
  return JSON.stringify([...rows].map((row) => ({
    id: row.id,
    competitionId: row.competitionId,
    season: row.season,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    date: row.date ?? row.playedAt ?? null,
    homeElo: row.preMatch?.homeElo ?? row.homeElo,
    awayElo: row.preMatch?.awayElo ?? row.awayElo,
    homeAdvantage: row.preMatch?.homeAdvantage ?? row.homeAdvantage,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
  })).sort((a, b) => a.id.localeCompare(b.id)));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function seasonCompleteRows(rows: readonly HistoricalCalibrationRow[], options: CalibrationFilterOptions): Set<string> {
  return fullSeasonSet(rows, options);
}

function makeWeightedRows(rows: readonly HistoricalCalibrationRow[], seasonOrder: readonly string[], parameters: CalibrationParameters): WeightedRow[] {
  const positions = new Map(seasonOrder.map((season, index) => [season, index]));
  const latest = seasonOrder.length - 1;
  return rows.map((row) => {
    const age = latest - (positions.get(row.season) ?? latest);
    const weight = parameters.seasonDecayFactor ** Math.max(0, age);
    const delta = effectiveEloDelta(row);
    return { row, delta, outcome: outcomeOf(row), weight, bucket: bucketLowerBound(delta) };
  });
}

function bucketKeys(rows: readonly WeightedRow[], prior: readonly CalibrationBucket[] = []): number[] {
  return [...new Set([...rows.map((row) => row.bucket), ...prior.map((bucket) => bucket.lowerBound)])].sort((a, b) => a - b);
}

function makeBuckets(
  rows: readonly WeightedRow[],
  priorBuckets: readonly CalibrationBucket[],
  priorOverall: CalibrationProbability,
  parameters: CalibrationParameters,
): CalibrationBucket[] {
  const keys = bucketKeys(rows, priorBuckets);
  return keys.map((lowerBound) => {
    const bucketRows = rows.filter((row) => row.bucket === lowerBound);
    const weights = bucketRows.map((row) => row.weight);
    const weightedObservations = weights.reduce((sum, weight) => sum + weight, 0);
    const effective = effectiveObservations(weights);
    const counts = zeroProbability();
    for (const row of bucketRows) addOutcome(counts, row.outcome, row.weight);
    const raw = weightedObservations === 0
      ? priorOverall
      : normalize({ home: counts.home / weightedObservations, draw: counts.draw / weightedObservations, away: counts.away / weightedObservations });
    const prior = probabilityAtBuckets(priorBuckets, lowerBound, priorOverall);
    const poolingWeight = effective === 0
      ? 0
      : parameters.poolingFactor === 0
        ? 1
        : effective / (effective + parameters.poolingFactor);
    const probability = normalize({
      home: poolingWeight * raw.home + (1 - poolingWeight) * prior.home,
      draw: poolingWeight * raw.draw + (1 - poolingWeight) * prior.draw,
      away: poolingWeight * raw.away + (1 - poolingWeight) * prior.away,
    });
    return {
      lowerBound,
      upperBound: lowerBound + parameters.bucketWidth,
      observations: bucketRows.length,
      weightedObservations,
      effectiveObservations: effective,
      poolingWeight,
      rawProbability: raw,
      priorProbability: prior,
      probability,
      thin: effective < parameters.minimumEffectiveObservations,
    };
  });
}

function artifactCoverage(
  rows: readonly WeightedRow[],
  report: CalibrationFilterReport,
  options: CalibrationFilterOptions,
  buckets: readonly CalibrationBucket[],
): CalibrationArtifactCoverage {
  const includedSeasons = [...new Set(rows.map((row) => row.row.season))].sort();
  const completeSeasons = [...seasonCompleteRows(report.includedRows, options)].filter((season) => includedSeasons.includes(season)).sort();
  return {
    ...report.coverage,
    includedSeasons,
    completeSeasons,
    bucketCount: buckets.length,
    effectiveObservations: effectiveObservations(rows.map((row) => row.weight)),
    reasonCounts: { ...report.reasonCounts },
  };
}

function reportForCompetition(
  report: CalibrationFilterReport,
  competitionId: string,
): CalibrationFilterReport {
  const includedRows = report.includedRows.filter((row) => row.competitionId === competitionId);
  const exclusions = report.exclusions.filter((item) => item.competitionId === competitionId);
  const reasonCounts: Partial<Record<CalibrationExclusionReason, number>> = {};
  for (const item of exclusions) reasonCounts[item.reason] = (reasonCounts[item.reason] ?? 0) + 1;
  const suppliedRows = includedRows.length + exclusions.length;
  const seasons = new Set(includedRows.map((row) => row.season));
  return {
    includedRows,
    exclusions,
    reasonCounts,
    coverage: {
      suppliedRows,
      eligibleRows: includedRows.length,
      includedRows: includedRows.length,
      excludedRows: exclusions.length,
      ratio: suppliedRows === 0 ? 0 : includedRows.length / suppliedRows,
      mappedRows: includedRows.length,
      seasons: seasons.size,
      fullSeasons: 0,
    },
  };
}

function statusFor(rows: readonly WeightedRow[], buckets: readonly CalibrationBucket[], completeSeasons: readonly string[], parameters: CalibrationParameters): { status: CalibrationStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (completeSeasons.length < 3) reasons.push("fewer-than-three-complete-seasons");
  if (rows.length === 0) reasons.push("no-effective-observations");
  if (rows.length > 0 && effectiveObservations(rows.map((row) => row.weight)) < parameters.minimumEffectiveObservations) reasons.push("insufficient-effective-observations");
  if (buckets.some((bucket) => bucket.observations > 0 && bucket.effectiveObservations < parameters.minimumEffectiveObservations)) reasons.push("thin-relevant-bucket");
  return { status: reasons.length === 0 ? "calibrated" : "provisional", reasons };
}

function createArtifact(
  kind: CalibrationArtifact["artifactKind"],
  competitionId: string | null,
  rows: readonly WeightedRow[],
  allReport: CalibrationFilterReport,
  artifactRows: readonly HistoricalCalibrationRow[],
  buckets: CalibrationBucket[],
  overall: CalibrationProbability,
  parameters: CalibrationParameters,
  options: CalibrationBuildOptions,
  datasetVersion: string,
  modelVersion: string,
  calibrationVersion: string,
  generatedAt: string,
): CalibrationArtifact {
  const includedSeasons = [...new Set(artifactRows.map((row) => row.season))].sort();
  const completeSeasons = [...seasonCompleteRows(artifactRows, options)].filter((season) => includedSeasons.includes(season)).sort();
  const status = statusFor(rows, buckets, completeSeasons, parameters);
  const metrics = metricForRows(rows, (delta) => probabilityAtBuckets(buckets, delta, overall));
  const content = {
    schemaVersion: CLUB_ELO_CALIBRATION_SCHEMA_VERSION,
    artifactKind: kind,
    competitionId,
    datasetVersion,
    modelVersion,
    calibrationVersion,
    includedSeasons,
    includedRows: artifactRows.length,
    status: status.status,
    provisional: status.status === "provisional",
    provisionalReasons: status.reasons,
    parameters,
    buckets,
    overallProbability: overall,
    metrics,
    coverage: artifactCoverage(rows, allReport, options, buckets),
  };
  return {
    ...content,
    generatedAt,
    artifactId: `clubelo-calibration-${hash(JSON.stringify(content)).slice(0, 16)}`,
  };
}

export function calibrateClubEloRows(
  rows: readonly HistoricalCalibrationRow[],
  options: CalibrationBuildOptions = {},
): CalibrationArtifactSet {
  const parameters = assertParameters(options);
  const filterReport = filterCalibrationRows(rows, options);
  const seasonOrder = seasonOrdering(filterReport.includedRows, options);
  const weightedRows = makeWeightedRows(filterReport.includedRows, seasonOrder, parameters);
  const generalOverall = overallProbability(weightedRows);
  const generalBuckets = makeBuckets(weightedRows, [], generalOverall, { ...parameters, poolingFactor: 0 });
  const datasetVersion = options.datasetVersion ?? `clubelo-dataset-${hash(canonicalRows(filterReport.includedRows)).slice(0, 16)}`;
  const modelVersion = options.modelVersion ?? CLUB_ELO_CALIBRATION_MODEL_VERSION;
  const calibrationVersion = options.calibrationVersion ?? CLUB_ELO_CALIBRATION_VERSION;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const generalPrior = createArtifact(
    "general-prior",
    null,
    weightedRows,
    filterReport,
    filterReport.includedRows,
    generalBuckets,
    generalOverall,
    parameters,
    options,
    datasetVersion,
    modelVersion,
    calibrationVersion,
    generatedAt,
  );
  const competitions: Record<string, CalibrationArtifact> = {};
  for (const competitionId of [...new Set(filterReport.includedRows.map((row) => row.competitionId))].sort()) {
    const competitionRows = filterReport.includedRows.filter((row) => row.competitionId === competitionId);
    const weightedCompetitionRows = makeWeightedRows(competitionRows, seasonOrder, parameters);
    const buckets = makeBuckets(weightedCompetitionRows, generalBuckets, generalOverall, parameters);
    const competitionOverall = overallProbability(weightedCompetitionRows);
    const competitionReport = reportForCompetition(filterReport, competitionId);
    competitions[competitionId] = createArtifact(
      "competition",
      competitionId,
      weightedCompetitionRows,
      competitionReport,
      competitionRows,
      buckets,
      competitionOverall,
      parameters,
      options,
      datasetVersion,
      modelVersion,
      calibrationVersion,
      generatedAt,
    );
  }
  return {
    schemaVersion: CLUB_ELO_CALIBRATION_SCHEMA_VERSION,
    datasetVersion,
    modelVersion,
    calibrationVersion,
    generatedAt,
    parameters,
    filterReport,
    generalPrior,
    competitions,
  };
}

export function probabilityForCalibration(
  artifacts: CalibrationArtifactSet,
  competitionId: string,
  delta: number,
): CalibrationProbability {
  const competition = artifacts.competitions[competitionId];
  const fallback = probabilityAtBuckets(artifacts.generalPrior.buckets, delta, artifacts.generalPrior.overallProbability);
  if (!competition) return fallback;
  return probabilityAtBuckets(competition.buckets, delta, fallback);
}

export async function saveCalibrationArtifacts(
  artifacts: CalibrationArtifactSet,
  store: CalibrationArtifactStore,
): Promise<void> {
  await store.save(artifacts.generalPrior);
  for (const competition of Object.values(artifacts.competitions)) await store.save(competition);
}
