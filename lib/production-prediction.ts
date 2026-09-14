import type { CalibrationArtifact, CalibrationArtifactSet } from "./clubelo-calibration";
import { probabilityForCalibration } from "./clubelo-calibration";
import {
  approvedMappingsForProduction,
  type ClubEloMappingDocument,
  type SourceClub,
} from "./clubelo-mapping";
import { calculateClubEloSnapshotHash, type ClubEloSnapshot, type TeamStrength } from "./clubelo-import";
import type { Fixture, Team } from "./data";
import {
  runPrediction,
  type LeagueSimulationResult,
  type MatchProbabilityModel,
  type PredictionRunInput,
} from "./simulation";
import type { CompetitionRules } from "./competition-rules";

export const CLUB_ELO_PRODUCTION_MODEL_VERSION = "elo-monte-carlo-v1" as const;
export const CLUB_ELO_HOME_ADVANTAGE = 50;

export interface ProductionPredictionInputs {
  mapping: ClubEloMappingDocument;
  snapshot: ClubEloSnapshot;
  calibration: CalibrationArtifactSet;
}

export interface ProductionPredictionOptions {
  competitionId: string;
  season: string;
  homeAdvantage?: number;
  rules: CompetitionRules;
}

export class ProductionPredictionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionPredictionInputError";
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new ProductionPredictionInputError(`${label} must be finite`);
}

function assertMappingScope(inputs: ProductionPredictionInputs, competitionId: string, season: string): void {
  const { scope } = inputs.mapping;
  if (scope.competitionId !== competitionId || scope.season !== season || scope.kind !== "current") {
    throw new ProductionPredictionInputError("ClubElo mapping scope does not match the production run");
  }
}

function assertProbability(probability: { home: number; draw: number; away: number }, fixtureId: string): void {
  if (!probability || typeof probability !== "object") throw new ProductionPredictionInputError(`calibration produced no probabilities for ${fixtureId}`);
  for (const value of [probability.home, probability.draw, probability.away]) {
    if (!Number.isFinite(value) || value < 0) throw new ProductionPredictionInputError(`calibration produced invalid probabilities for fixture ${fixtureId}`);
  }
  if (Math.abs(probability.home + probability.draw + probability.away - 1) > 1e-8) {
    throw new ProductionPredictionInputError(`calibration probabilities for fixture ${fixtureId} must sum to 1`);
  }
}

function validateSnapshot(snapshot: ClubEloSnapshot, teams: readonly Team[], competitionId: string, season: string): Map<string, TeamStrength> {
  if (snapshot.schemaVersion !== 1) throw new ProductionPredictionInputError("ClubElo snapshot schema version is unsupported");
  if (snapshot.competitionId !== competitionId || snapshot.season !== season) {
    throw new ProductionPredictionInputError("ClubElo snapshot scope does not match the competition run");
  }
  if (!snapshot.snapshotId || !snapshot.snapshotHash) throw new ProductionPredictionInputError("ClubElo snapshot is missing immutable identity metadata");
  if (!Number.isInteger(snapshot.sourceRound) || snapshot.sourceRound < 0 || !Array.isArray(snapshot.strengths)) {
    throw new ProductionPredictionInputError("ClubElo snapshot has invalid round or strength data");
  }
  if (calculateClubEloSnapshotHash(snapshot) !== snapshot.snapshotHash) {
    throw new ProductionPredictionInputError("ClubElo snapshot hash does not match its contents");
  }

  const strengths = new Map<string, TeamStrength>();
  for (const strength of snapshot.strengths) {
    if (strength.source !== "clubelo" || !Number.isFinite(strength.elo) || Number.isNaN(strength.measuredAt.getTime())) {
      throw new ProductionPredictionInputError(`ClubElo snapshot contains invalid strength data for ${strength.teamId}`);
    }
    if (strengths.has(strength.teamId)) throw new ProductionPredictionInputError(`ClubElo snapshot contains duplicate strength for ${strength.teamId}`);
    strengths.set(strength.teamId, strength);
  }
  for (const team of teams) {
    if (!strengths.has(team.id)) throw new ProductionPredictionInputError(`ClubElo snapshot is missing strength for ${team.id}`);
  }
  if (strengths.size !== teams.length) throw new ProductionPredictionInputError("ClubElo snapshot contains strengths for unknown teams");
  return strengths;
}

function validateCalibration(calibration: CalibrationArtifactSet, competitionId: string): CalibrationArtifact {
  if (calibration.schemaVersion !== 1 || !calibration.generalPrior || !calibration.competitions || typeof calibration.competitions !== "object") {
    throw new ProductionPredictionInputError("calibration artifact set is missing or has an unsupported schema");
  }
  const selected = calibration.competitions[competitionId] ?? calibration.generalPrior;
  if (!selected.artifactId || selected.modelVersion !== calibration.modelVersion || selected.calibrationVersion !== calibration.calibrationVersion) {
    throw new ProductionPredictionInputError("calibration artifact metadata is inconsistent");
  }
  if (selected.buckets.some((bucket) =>
    !Number.isFinite(bucket.probability.home) || !Number.isFinite(bucket.probability.draw) || !Number.isFinite(bucket.probability.away) ||
    bucket.probability.home < 0 || bucket.probability.draw < 0 || bucket.probability.away < 0 ||
    Math.abs(bucket.probability.home + bucket.probability.draw + bucket.probability.away - 1) > 1e-8
  )) throw new ProductionPredictionInputError("calibration artifact contains invalid probabilities");
  assertProbability(selected.overallProbability, selected.artifactId);
  return selected;
}

export function createClubEloProbabilityModel(
  teams: readonly Team[],
  inputs: ProductionPredictionInputs,
  options: ProductionPredictionOptions,
): MatchProbabilityModel {
  const sourceClubs: SourceClub[] = teams.map(({ id, name }) => ({ id, name }));
  assertMappingScope(inputs, options.competitionId, options.season);
  const mappings = approvedMappingsForProduction(inputs.mapping.mappings, sourceClubs, {
    scope: { competitionId: options.competitionId, season: options.season, kind: "current" },
  });
  const strengths = validateSnapshot(inputs.snapshot, teams, options.competitionId, options.season);
  validateCalibration(inputs.calibration, options.competitionId);
  const mappingBySourceId = new Map(mappings.map((mapping) => [mapping.sourceId, mapping]));
  const homeAdvantage = options.homeAdvantage ?? CLUB_ELO_HOME_ADVANTAGE;
  assertFinite(homeAdvantage, "homeAdvantage");

  return {
    version: CLUB_ELO_PRODUCTION_MODEL_VERSION,
    predict(fixture: Fixture): Pick<Fixture, "homeWinProb" | "drawProb" | "awayWinProb" | "source"> {
      const homeMapping = mappingBySourceId.get(fixture.homeTeam);
      const awayMapping = mappingBySourceId.get(fixture.awayTeam);
      const homeStrength = strengths.get(fixture.homeTeam);
      const awayStrength = strengths.get(fixture.awayTeam);
      if (!homeMapping || !awayMapping || !homeStrength || !awayStrength) {
        throw new ProductionPredictionInputError(`production ClubElo input is incomplete for fixture ${fixture.id}`);
      }
      const delta = homeStrength.elo + homeAdvantage - awayStrength.elo;
      const probability = probabilityForCalibration(inputs.calibration, options.competitionId, delta);
      assertProbability(probability, fixture.id);
      return {
        homeWinProb: probability.home,
        drawProb: probability.draw,
        awayWinProb: probability.away,
        source: "clubelo",
      };
    },
  };
}

export function runClubEloPrediction(
  input: Omit<PredictionRunInput, "model" | "rules" | "metadata"> & {
    inputs: ProductionPredictionInputs;
    rules: CompetitionRules;
    homeAdvantage?: number;
  },
): LeagueSimulationResult {
  const sourceClubs: SourceClub[] = input.teams.map(({ id, name }) => ({ id, name }));
  const eligibleFixtures = input.fixtures.map((fixture) => ({ homeSourceId: fixture.homeTeam, awaySourceId: fixture.awayTeam }));
  const mappings = approvedMappingsForProduction(input.inputs.mapping.mappings, sourceClubs, {
    scope: { competitionId: input.competition, season: input.season, kind: "current" },
    eligibleFixtures,
  });
  const model = createClubEloProbabilityModel(input.teams, { ...input.inputs, mapping: { ...input.inputs.mapping, mappings } }, {
    competitionId: input.competition,
    season: input.season,
    homeAdvantage: input.homeAdvantage,
    rules: input.rules,
  });
  const selectedCalibration = input.inputs.calibration.competitions[input.competition] ?? input.inputs.calibration.generalPrior;
  const mappingCoverage = {
    eligible: input.fixtures.length,
    mapped: input.fixtures.filter((fixture) => mappings.some((mapping) => mapping.sourceId === fixture.homeTeam) && mappings.some((mapping) => mapping.sourceId === fixture.awayTeam)).length,
    ratio: input.fixtures.length === 0 ? 1 : input.fixtures.filter((fixture) => mappings.some((mapping) => mapping.sourceId === fixture.homeTeam) && mappings.some((mapping) => mapping.sourceId === fixture.awayTeam)).length / input.fixtures.length,
    required: 1,
  };
  return runPrediction({
    ...input,
    model,
    rules: input.rules,
    metadata: {
      configuration: { homeAdvantage: input.homeAdvantage ?? CLUB_ELO_HOME_ADVANTAGE, rulesVersion: input.rules.version },
      calibration: {
        artifactId: selectedCalibration.artifactId,
        modelVersion: input.inputs.calibration.modelVersion,
        version: input.inputs.calibration.calibrationVersion,
        status: selectedCalibration.status,
        provisional: selectedCalibration.provisional,
        provisionalReasons: selectedCalibration.provisionalReasons,
      },
      mapping: {
        artifactId: input.inputs.mapping.artifactId ?? `${input.inputs.mapping.generatorVersion}-${input.inputs.mapping.generatedAt}`,
        generatorVersion: input.inputs.mapping.generatorVersion,
        coverage: mappingCoverage,
      },
      snapshot: {
        id: input.inputs.snapshot.snapshotId,
        hash: input.inputs.snapshot.snapshotHash,
        sourceRound: input.inputs.snapshot.sourceRound,
        freshness: input.inputs.snapshot.freshness,
        reused: input.inputs.snapshot.reused,
      },
      coverage: {
        teams: input.teams.length,
        strengths: input.inputs.snapshot.strengths.length,
        fixtures: input.fixtures.length,
        calibratedFixtures: input.fixtures.length,
      },
    },
  });
}

export function validateProductionInputs(
  teams: readonly Team[],
  fixtures: readonly Fixture[],
  inputs: ProductionPredictionInputs,
  options: ProductionPredictionOptions,
): void {
  const sourceClubs: SourceClub[] = teams.map(({ id, name }) => ({ id, name }));
  assertMappingScope(inputs, options.competitionId, options.season);
  const eligibleFixtures = fixtures.map((fixture) => ({ homeSourceId: fixture.homeTeam, awaySourceId: fixture.awayTeam }));
  approvedMappingsForProduction(inputs.mapping.mappings, sourceClubs, {
    scope: { competitionId: options.competitionId, season: options.season, kind: "current" },
    eligibleFixtures,
  });
  validateSnapshot(inputs.snapshot, teams, options.competitionId, options.season);
  validateCalibration(inputs.calibration, options.competitionId);
}
