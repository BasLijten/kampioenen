import type { Fixture, Team } from "./data";

/** The normalized match shape used by the prediction engine. */
export interface Match {
  id: string;
  date: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface MatchProbability {
  home: number;
  draw: number;
  away: number;
}

/** A probability adapter. Providers and provider DTOs stay outside this seam. */
export interface MatchProbabilityModel {
  predict(match: Match): MatchProbability;
}

export interface CompetitionSnapshot {
  competitionId: string;
  season: string;
  totalRounds: number;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  teams: readonly Team[];
  fixtures: readonly Match[];
}

export interface PredictionRunConfig {
  iterations: number;
  seed: number;
  modelVersion: string;
}

export interface PredictionRunInput {
  competition: CompetitionSnapshot;
  probabilityModel: MatchProbabilityModel;
  config: PredictionRunConfig;
}

export interface PredictionRunMetadata {
  competitionId: string;
  season: string;
  modelVersion: string;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  seed: number;
  simulationCount: number;
}

export interface SimulationResult {
  totalChampionshipProbability: number;
  dateProbabilities: DateProbability[];
  bestCaseDate: string | null;
  bestCaseRound: number | null;
  expectedDate: string | null;
  neverChampionProbability: number;
  iterations: number;
  neverChampionCount: number;
}

export interface DateProbability {
  date: string;
  round: number;
  probability: number;
  cumulativeProbability: number;
  opponent: string;
  isHome: boolean;
}

export interface LeagueSimulationResult {
  clubResults: Record<string, ClubSimulationResult>;
  iterations: number;
}

export interface ClubSimulationResult {
  teamId: string;
  teamName: string;
  totalChampionshipProbability: number;
  dateProbabilities: DateProbability[];
  bestCaseDate: string | null;
  bestCaseRound: number | null;
  expectedDate: string | null;
  neverChampionProbability: number;
  neverChampionCount: number;
  positionProbabilities: Record<number, number>;
}

export interface PredictionRun extends LeagueSimulationResult {
  metadata: PredictionRunMetadata;
}

/** Options retained for callers of the original positional simulation API. */
export interface SimulationOptions {
  seed?: number;
  /** Alias matching the persisted run metadata terminology. */
  randomSeed?: number;
  probabilityModel?: MatchProbabilityModel;
}

interface TeamState {
  [teamId: string]: { points: number; played: number };
}

interface SimulatedMatch extends Match {
  probability: MatchProbability;
}

const DEFAULT_SEED = 1;
const PROBABILITY_EPSILON = 1e-9;

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareMatches(a: Match, b: Match): number {
  return compareStrings(a.date, b.date) || compareStrings(a.id, b.id);
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateMatch(
  probability: MatchProbability,
  random: () => number
): "home" | "draw" | "away" {
  const value = random();
  if (value < probability.home) return "home";
  if (value < probability.home + probability.draw) return "draw";
  return "away";
}

function isChampion(
  teamId: string,
  state: TeamState,
  allTeams: readonly Team[],
  totalRounds: number
): boolean {
  const myPoints = state[teamId].points;

  for (const team of allTeams) {
    if (team.id === teamId) continue;
    const other = state[team.id];
    const otherRemaining = totalRounds - other.played;
    const otherMax = other.points + otherRemaining * 3;
    if (otherMax >= myPoints) return false;
  }
  return true;
}

function assertValidProbability(match: Match, probability: MatchProbability): void {
  const values = [probability.home, probability.draw, probability.away];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error(`Invalid probabilities for match ${match.id}`);
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > PROBABILITY_EPSILON) {
    throw new Error(`Probabilities for match ${match.id} must sum to 1`);
  }
}

function validateCompetition(competition: CompetitionSnapshot): Team[] {
  if (!Number.isInteger(competition.totalRounds) || competition.totalRounds < 1) {
    throw new Error("Competition totalRounds must be a positive integer");
  }

  const teams = [...competition.teams].sort((a, b) => compareStrings(a.id, b.id));
  const teamIds = new Set<string>();
  for (const team of teams) {
    if (!team.id || teamIds.has(team.id)) {
      throw new Error(`Duplicate or empty team id: ${team.id}`);
    }
    teamIds.add(team.id);
  }

  const matchIds = new Set<string>();
  for (const match of competition.fixtures) {
    if (!match.id || matchIds.has(match.id)) {
      throw new Error(`Duplicate or empty match id: ${match.id}`);
    }
    if (!teamIds.has(match.homeTeamId) || !teamIds.has(match.awayTeamId)) {
      throw new Error(`Match ${match.id} references an unknown team`);
    }
    if (match.homeTeamId === match.awayTeamId) {
      throw new Error(`Match ${match.id} cannot have the same home and away team`);
    }
    matchIds.add(match.id);
  }
  return teams;
}

function toMatch(fixture: Fixture): Match {
  return {
    id: fixture.id,
    date: fixture.date,
    round: fixture.round,
    homeTeamId: fixture.homeTeam,
    awayTeamId: fixture.awayTeam,
  };
}

/** Adapter for the current precomputed BZZOIRO/Poisson fixture probabilities. */
export function createFixtureProbabilityModel(
  fixtures: readonly Fixture[]
): MatchProbabilityModel {
  const probabilities = new Map(
    fixtures.map((fixture) => [
      fixture.id,
      {
        home: fixture.homeWinProb,
        draw: fixture.drawProb,
        away: fixture.awayWinProb,
      },
    ])
  );

  return {
    predict(match) {
      const probability = probabilities.get(match.id);
      if (!probability) throw new Error(`No probability found for match ${match.id}`);
      return probability;
    },
  };
}

function runSimulationCore(
  iterations: number,
  teams: readonly Team[],
  matches: readonly SimulatedMatch[],
  totalRounds: number,
  seed: number
): LeagueSimulationResult {
  const orderedTeams = [...teams].sort((a, b) => compareStrings(a.id, b.id));
  const orderedMatches = [...matches].sort(compareMatches);
  const rounds = [...new Set(orderedMatches.map((match) => match.round))].sort((a, b) => a - b);
  const allDates = [...new Set(orderedMatches.map((match) => match.date))].sort(compareStrings);
  const fixturesByDate = new Map<string, SimulatedMatch[]>();
  const dateToRound = new Map<string, number>();

  for (const match of orderedMatches) {
    const matchesOnDate = fixturesByDate.get(match.date) ?? [];
    matchesOnDate.push(match);
    fixturesByDate.set(match.date, matchesOnDate);
    const currentRound = dateToRound.get(match.date);
    if (currentRound === undefined || match.round < currentRound) {
      dateToRound.set(match.date, match.round);
    }
  }

  const championshipCounts: Record<string, Record<string, number>> = {};
  const neverChampion: Record<string, number> = {};
  const positionCounts: Record<string, Record<number, number>> = {};
  for (const team of orderedTeams) {
    championshipCounts[team.id] = {};
    neverChampion[team.id] = 0;
    positionCounts[team.id] = {};
  }

  const random = createRandom(seed);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const state: TeamState = {};
    for (const team of orderedTeams) {
      state[team.id] = { points: team.points, played: team.played };
    }

    const championDate: Record<string, string | null> = {};
    for (const team of orderedTeams) championDate[team.id] = null;

    for (const date of allDates) {
      for (const match of fixturesByDate.get(date) ?? []) {
        const result = simulateMatch(match.probability, random);
        if (result === "home") {
          state[match.homeTeamId].points += 3;
        } else if (result === "draw") {
          state[match.homeTeamId].points += 1;
          state[match.awayTeamId].points += 1;
        } else {
          state[match.awayTeamId].points += 3;
        }
        state[match.homeTeamId].played += 1;
        state[match.awayTeamId].played += 1;
      }

      for (const team of orderedTeams) {
        if (championDate[team.id] === null && isChampion(team.id, state, orderedTeams, totalRounds)) {
          championDate[team.id] = date;
        }
      }
    }

    for (const team of orderedTeams) {
      const date = championDate[team.id];
      if (date !== null) {
        championshipCounts[team.id][date] = (championshipCounts[team.id][date] || 0) + 1;
      } else {
        neverChampion[team.id]++;
      }
    }

    const finalRanking = [...orderedTeams].sort((a, b) => {
      const pointsDifference = state[b.id].points - state[a.id].points;
      if (pointsDifference !== 0) return pointsDifference;
      const goalDifference =
        (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
      return goalDifference || compareStrings(a.id, b.id);
    });
    finalRanking.forEach((team, index) => {
      const position = index + 1;
      positionCounts[team.id][position] = (positionCounts[team.id][position] || 0) + 1;
    });
  }

  const clubResults: Record<string, ClubSimulationResult> = {};
  for (const team of orderedTeams) {
    const totalChampion = iterations - neverChampion[team.id];
    const totalProbability = totalChampion / iterations;
    let cumulative = 0;
    const dateProbabilities: DateProbability[] = rounds.map((round) => {
      const teamFixture = orderedMatches.find(
        (match) =>
          match.round === round &&
          (match.homeTeamId === team.id || match.awayTeamId === team.id)
      );
      const roundDates = allDates.filter((date) =>
        (fixturesByDate.get(date) ?? []).some((match) => match.round === round)
      );
      const date = teamFixture?.date ?? roundDates[0];
      let count = 0;
      for (const roundDate of roundDates) {
        count += championshipCounts[team.id][roundDate] || 0;
      }
      const probability = count / iterations;
      cumulative += probability;

      return {
        date,
        round,
        probability,
        cumulativeProbability: cumulative,
        opponent: teamFixture
          ? teamFixture.homeTeamId === team.id
            ? teamFixture.awayTeamId
            : teamFixture.homeTeamId
          : "vrij",
        isHome: teamFixture?.homeTeamId === team.id,
      };
    });

    let bestCaseDate: string | null = null;
    let bestCaseRound: number | null = null;
    const bestState: TeamState = {};
    for (const candidate of orderedTeams) {
      bestState[candidate.id] = { points: candidate.points, played: candidate.played };
    }

    for (const date of allDates) {
      for (const match of fixturesByDate.get(date) ?? []) {
        if (match.homeTeamId === team.id || match.awayTeamId === team.id) {
          bestState[team.id].points += 3;
        }
        bestState[match.homeTeamId].played += 1;
        bestState[match.awayTeamId].played += 1;
      }
      if (bestCaseRound === null && isChampion(team.id, bestState, orderedTeams, totalRounds)) {
        bestCaseRound = dateToRound.get(date) ?? null;
        bestCaseDate = date;
      }
    }

    let expectedDate: string | null = null;
    if (totalProbability > 0) {
      let maxProbability = 0;
      for (const dateProbability of dateProbabilities) {
        if (dateProbability.probability > maxProbability) {
          maxProbability = dateProbability.probability;
          expectedDate = dateProbability.date;
        }
      }
    }

    const positionProbabilities: Record<number, number> = {};
    for (const [position, count] of Object.entries(positionCounts[team.id])) {
      positionProbabilities[Number(position)] = count / iterations;
    }

    clubResults[team.id] = {
      teamId: team.id,
      teamName: team.name,
      totalChampionshipProbability: totalProbability,
      dateProbabilities,
      bestCaseDate,
      bestCaseRound,
      expectedDate,
      neverChampionProbability: neverChampion[team.id] / iterations,
      neverChampionCount: neverChampion[team.id],
      positionProbabilities,
    };
  }

  return { clubResults, iterations };
}

export function runPrediction(input: PredictionRunInput): PredictionRun {
  const { competition, probabilityModel, config } = input;
  if (!Number.isInteger(config.iterations) || config.iterations < 1) {
    throw new Error("Prediction iterations must be a positive integer");
  }
  if (!Number.isInteger(config.seed)) {
    throw new Error("Prediction seed must be an integer");
  }
  if (!config.modelVersion) throw new Error("Prediction modelVersion is required");

  const teams = validateCompetition(competition);
  const matches = [...competition.fixtures].sort(compareMatches).map((match) => {
    const probability = probabilityModel.predict(match);
    assertValidProbability(match, probability);
    return { ...match, probability };
  });
  const result = runSimulationCore(
    config.iterations,
    teams,
    matches,
    competition.totalRounds,
    config.seed
  );

  return {
    ...result,
    metadata: {
      competitionId: competition.competitionId,
      season: competition.season,
      modelVersion: config.modelVersion,
      standingsSnapshotId: competition.standingsSnapshotId,
      fixturesSnapshotId: competition.fixturesSnapshotId,
      seed: config.seed,
      simulationCount: config.iterations,
    },
  };
}

export function runSimulation(
  iterations: number = 50000,
  teams: Team[] = [],
  remainingFixtures: Fixture[] = [],
  totalRounds: number = 34,
  options: SimulationOptions | number = {}
): LeagueSimulationResult {
  const resolvedOptions = typeof options === "number" ? { seed: options } : options;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("Simulation iterations must be a positive integer");
  }
  const seed = resolvedOptions.seed ?? resolvedOptions.randomSeed ?? DEFAULT_SEED;
  if (!Number.isInteger(seed)) throw new Error("Simulation seed must be an integer");

  const model = resolvedOptions.probabilityModel ?? createFixtureProbabilityModel(remainingFixtures);
  const matches = remainingFixtures.map(toMatch).sort(compareMatches).map((match) => {
    const probability = model.predict(match);
    assertValidProbability(match, probability);
    return { ...match, probability };
  });
  const orderedTeams = validateCompetition({
    competitionId: "legacy",
    season: "unknown",
    totalRounds,
    standingsSnapshotId: "unknown",
    fixturesSnapshotId: "unknown",
    teams,
    fixtures: matches,
  });
  return runSimulationCore(iterations, orderedTeams, matches, totalRounds, seed);
}
