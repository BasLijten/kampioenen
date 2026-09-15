import type {
  CompetitionInput,
  Fixture,
  Match,
  MatchProbability,
  MatchProbabilityModel,
  Team,
} from "./data";

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

export interface PredictionRunConfig {
  modelVersion: string;
  competitionId: string;
  season: string;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  iterations: number;
}

export interface PredictionRunMetadata {
  modelVersion: string;
  competitionId: string;
  season: string;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  iterations: number;
  seed: number;
}

export type InjectedProbabilityModel = MatchProbabilityModel;

export interface PredictionRunInput {
  competition: CompetitionInput;
  probabilityModel: InjectedProbabilityModel;
  config: PredictionRunConfig;
  seed: number;
}

export interface PredictionRunResult extends LeagueSimulationResult {
  metadata: PredictionRunMetadata;
}

interface TeamState {
  [teamId: string]: { points: number; played: number };
}

interface SimulationFixture extends Match {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
}

export const DEFAULT_SIMULATION_SEED = 1;

function stableFixtureOrder(a: Match, b: Match): number {
  return (
    a.date.localeCompare(b.date) ||
    a.id.localeCompare(b.id) ||
    a.round - b.round ||
    a.homeTeam.localeCompare(b.homeTeam) ||
    a.awayTeam.localeCompare(b.awayTeam)
  );
}

function sortedTeams(teams: readonly Team[]): Team[] {
  return [...teams].sort((a, b) => a.id.localeCompare(b.id));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function validateRunInput(input: PredictionRunInput): void {
  const { competition, config, seed } = input;

  if (!Number.isInteger(config.iterations) || config.iterations < 0) {
    throw new Error("Prediction run iterations must be a non-negative integer");
  }
  if (!Number.isInteger(seed)) {
    throw new Error("Prediction run seed must be an integer");
  }
  if (!Number.isInteger(competition.totalRounds) || competition.totalRounds < 0) {
    throw new Error("Competition totalRounds must be a non-negative integer");
  }

  const teamIds = new Set<string>();
  for (const team of competition.teams) {
    if (teamIds.has(team.id)) throw new Error(`Duplicate team id: ${team.id}`);
    teamIds.add(team.id);
  }

  const fixtureIds = new Set<string>();
  for (const fixture of competition.remainingFixtures) {
    if (fixtureIds.has(fixture.id)) throw new Error(`Duplicate fixture id: ${fixture.id}`);
    fixtureIds.add(fixture.id);
    if (!teamIds.has(fixture.homeTeam) || !teamIds.has(fixture.awayTeam)) {
      throw new Error(`Fixture ${fixture.id} references an unknown team`);
    }
  }
}

function probabilityFor(
  model: InjectedProbabilityModel,
  match: Match
): MatchProbability {
  return model.predict(match);
}

function validateProbability(match: Match, probability: MatchProbability): void {
  const values = [probability.home, probability.draw, probability.away];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-9
  ) {
    throw new Error(`Invalid match probabilities for fixture ${match.id}`);
  }
}

function prepareFixtures(
  competition: CompetitionInput,
  probabilityModel: InjectedProbabilityModel
): SimulationFixture[] {
  return [...competition.remainingFixtures]
    .sort(stableFixtureOrder)
    .map((match) => {
      const probability = probabilityFor(probabilityModel, match);
      validateProbability(match, probability);
      return {
        ...match,
        homeWinProb: probability.home,
        drawProb: probability.draw,
        awayWinProb: probability.away,
      };
    });
}

function simulateMatch(
  fixture: SimulationFixture,
  random: () => number
): "home" | "draw" | "away" {
  const rand = random();
  if (rand < fixture.homeWinProb) return "home";
  if (rand < fixture.homeWinProb + fixture.drawProb) return "draw";
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
    const otherPoints = state[team.id].points;
    const otherPlayed = state[team.id].played;
    const otherRemaining = totalRounds - otherPlayed;
    const otherMax = otherPoints + otherRemaining * 3;
    if (otherMax >= myPoints) return false;
  }
  return true;
}

function ratio(count: number, iterations: number): number {
  return iterations === 0 ? 0 : count / iterations;
}

function simulateLeague(
  iterations: number,
  teamsInput: readonly Team[],
  remainingFixtures: readonly SimulationFixture[],
  totalRounds: number,
  seed: number
): LeagueSimulationResult {
  const teams = sortedTeams(teamsInput);
  const fixtures = [...remainingFixtures].sort(stableFixtureOrder);
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort(
    (a, b) => a - b
  );
  const allDates = [...new Set(fixtures.map((fixture) => fixture.date))].sort();
  const fixturesByDate = new Map<string, SimulationFixture[]>();
  const dateToRound = new Map<string, number>();

  for (const date of allDates) fixturesByDate.set(date, []);
  for (const fixture of fixtures) {
    fixturesByDate.get(fixture.date)!.push(fixture);
    const currentRound = dateToRound.get(fixture.date);
    if (currentRound === undefined || fixture.round < currentRound) {
      dateToRound.set(fixture.date, fixture.round);
    }
  }

  const championshipCounts: Record<string, Record<string, number>> = {};
  const neverChampion: Record<string, number> = {};
  const positionCounts: Record<string, Record<number, number>> = {};
  for (const team of teams) {
    championshipCounts[team.id] = {};
    neverChampion[team.id] = 0;
    positionCounts[team.id] = {};
  }

  const random = createSeededRandom(seed);

  for (let i = 0; i < iterations; i++) {
    const state: TeamState = {};
    for (const team of teams) {
      state[team.id] = { points: team.points, played: team.played };
    }

    const championDate: Record<string, string | null> = {};
    for (const team of teams) championDate[team.id] = null;

    for (const date of allDates) {
      for (const fixture of fixturesByDate.get(date)!) {
        const result = simulateMatch(fixture, random);
        if (result === "home") {
          state[fixture.homeTeam].points += 3;
        } else if (result === "draw") {
          state[fixture.homeTeam].points += 1;
          state[fixture.awayTeam].points += 1;
        } else {
          state[fixture.awayTeam].points += 3;
        }
        state[fixture.homeTeam].played += 1;
        state[fixture.awayTeam].played += 1;
      }

      for (const team of teams) {
        if (
          championDate[team.id] === null &&
          isChampion(team.id, state, teams, totalRounds)
        ) {
          championDate[team.id] = date;
        }
      }
    }

    for (const team of teams) {
      const date = championDate[team.id];
      if (date !== null) {
        championshipCounts[team.id][date] =
          (championshipCounts[team.id][date] || 0) + 1;
      } else {
        neverChampion[team.id]++;
      }
    }

    const finalRanking = [...teams].sort((a, b) => {
      const pointDifference = state[b.id].points - state[a.id].points;
      if (pointDifference !== 0) return pointDifference;
      const goalDifference =
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst);
      if (goalDifference !== 0) return goalDifference;
      return a.id.localeCompare(b.id);
    });
    finalRanking.forEach((team, index) => {
      const position = index + 1;
      positionCounts[team.id][position] =
        (positionCounts[team.id][position] || 0) + 1;
    });
  }

  const clubResults: Record<string, ClubSimulationResult> = {};

  for (const team of teams) {
    const totalChampion = iterations - neverChampion[team.id];
    const totalProbability = ratio(totalChampion, iterations);
    let cumulative = 0;

    const dateProbabilities: DateProbability[] = rounds.map((round) => {
      const roundDates = allDates.filter((date) => dateToRound.get(date) === round);
      const teamFixture = fixtures.find(
        (fixture) =>
          fixture.round === round &&
          (fixture.homeTeam === team.id || fixture.awayTeam === team.id)
      );
      const probability = ratio(
        roundDates.reduce(
          (count, date) => count + (championshipCounts[team.id][date] || 0),
          0
        ),
        iterations
      );
      cumulative += probability;

      return {
        date: teamFixture?.date || roundDates[0],
        round,
        probability,
        cumulativeProbability: cumulative,
        opponent: teamFixture
          ? teamFixture.homeTeam === team.id
            ? teamFixture.awayTeam
            : teamFixture.homeTeam
          : "vrij",
        isHome: teamFixture?.homeTeam === team.id,
      };
    });

    let bestCaseDate: string | null = null;
    let bestCaseRound: number | null = null;
    const bestState: TeamState = {};
    for (const currentTeam of teams) {
      bestState[currentTeam.id] = {
        points: currentTeam.points,
        played: currentTeam.played,
      };
    }

    for (const date of allDates) {
      for (const fixture of fixturesByDate.get(date)!) {
        const isTeamFixture =
          fixture.homeTeam === team.id || fixture.awayTeam === team.id;
        if (isTeamFixture) bestState[team.id].points += 3;
        bestState[fixture.homeTeam].played += 1;
        bestState[fixture.awayTeam].played += 1;
      }
      if (
        bestCaseRound === null &&
        isChampion(team.id, bestState, teams, totalRounds)
      ) {
        bestCaseDate = date;
        bestCaseRound = dateToRound.get(date) ?? null;
      }
    }

    let expectedDate: string | null = null;
    if (totalProbability > 0) {
      let highestProbability = 0;
      for (const dateProbability of dateProbabilities) {
        if (dateProbability.probability > highestProbability) {
          highestProbability = dateProbability.probability;
          expectedDate = dateProbability.date;
        }
      }
    }

    const positionProbabilities: Record<number, number> = {};
    for (const [position, count] of Object.entries(positionCounts[team.id])) {
      positionProbabilities[Number(position)] = ratio(count, iterations);
    }

    clubResults[team.id] = {
      teamId: team.id,
      teamName: team.name,
      totalChampionshipProbability: totalProbability,
      dateProbabilities,
      bestCaseDate,
      bestCaseRound,
      expectedDate,
      neverChampionProbability: ratio(neverChampion[team.id], iterations),
      neverChampionCount: neverChampion[team.id],
      positionProbabilities,
    };
  }

  return { clubResults, iterations };
}

export function runPredictionRun(input: PredictionRunInput): PredictionRunResult {
  validateRunInput(input);
  const { competition, probabilityModel, config, seed } = input;
  const fixtures = prepareFixtures(competition, probabilityModel);
  const result = simulateLeague(
    config.iterations,
    competition.teams,
    fixtures,
    competition.totalRounds,
    seed
  );

  const metadata: PredictionRunMetadata = {
    modelVersion: config.modelVersion,
    competitionId: config.competitionId,
    season: config.season,
    standingsSnapshotId: config.standingsSnapshotId,
    fixturesSnapshotId: config.fixturesSnapshotId,
    iterations: config.iterations,
    seed,
  };

  return { ...result, metadata };
}

function legacyProbabilityModel(): MatchProbabilityModel {
  return {
    predict(match) {
      const fixture = match as Fixture;
      return {
        home: fixture.homeWinProb,
        draw: fixture.drawProb,
        away: fixture.awayWinProb,
      };
    },
  };
}

export function runSimulation(input: PredictionRunInput): PredictionRunResult;
export function runSimulation(
  iterations?: number,
  teams?: Team[],
  remainingFixtures?: Fixture[],
  totalRounds?: number,
  seed?: number
): LeagueSimulationResult;
export function runSimulation(
  iterationsOrInput: number | PredictionRunInput = 50000,
  teams: Team[] = [],
  remainingFixtures: Fixture[] = [],
  totalRounds = 34,
  seed = DEFAULT_SIMULATION_SEED
): LeagueSimulationResult | PredictionRunResult {
  if (typeof iterationsOrInput !== "number") {
    return runPredictionRun(iterationsOrInput);
  }

  if (!Number.isInteger(iterationsOrInput) || iterationsOrInput < 0) {
    throw new Error("Simulation iterations must be a non-negative integer");
  }

  return simulateLeague(
    iterationsOrInput,
    teams,
    remainingFixtures,
    totalRounds,
    seed
  );
}

/** Builds a new run input for the legacy Fixture probability fields. */
export function legacyPredictionInput(
  iterations: number,
  teams: Team[],
  remainingFixtures: Fixture[],
  totalRounds: number,
  config: Omit<PredictionRunConfig, "iterations">,
  seed = DEFAULT_SIMULATION_SEED
): PredictionRunInput {
  return {
    competition: { teams, remainingFixtures, totalRounds },
    probabilityModel: legacyProbabilityModel(),
    config: { ...config, iterations },
    seed,
  };
}
