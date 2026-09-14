import type { Fixture, Team } from "./data";
import {
  eredivisieRules,
  type CompetitionRules,
  type HeadToHeadData,
  type SimulatedStanding,
} from "./competition-rules";

export interface SimulationOptions {
  rules?: CompetitionRules;
  seed?: number;
  headToHead?: HeadToHeadData;
}

/** Backwards-compatible summary shape for callers that only need one result. */
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
  metadata?: PredictionRunMetadata;
  seed: number;
  rulesVersion: string;
  fixtureOrder: string[];
  seededTieBreakCount: number;
}

export interface PredictionRunMetadata {
  modelVersion: string;
  competition: string;
  season: string;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  seed: number;
  iterations: number;
}

export interface MatchProbabilityModel {
  version: string;
  predict(fixture: Fixture, teams: readonly Team[]): Pick<Fixture, "homeWinProb" | "drawProb" | "awayWinProb">;
}

export interface PredictionRunInput {
  teams: readonly Team[];
  fixtures: readonly Fixture[];
  totalRounds: number;
  iterations: number;
  seed: number;
  competition: string;
  season: string;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  model: MatchProbabilityModel;
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
  noClinchProbability: number;
  tieProbability: number;
  positionProbabilities: Record<number, number>;
  simulatedGoalsFor: number;
  simulatedGoalsAgainst: number;
  simulatedGoalDifference: number;
}

const DEFAULT_SEED = 1;
const DEFAULT_HOME_GOALS = 1.45;
const DEFAULT_AWAY_GOALS = 1.15;
const MAX_GOALS = 8;
type MatchResult = "home" | "draw" | "away";
type TeamState = SimulatedStanding & { name: string };

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sortedFixtures(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function validateFixtures(teams: Team[], fixtures: Fixture[]): void {
  const ids = new Set(teams.map((team) => team.id));
  for (const fixture of fixtures) {
    if (!ids.has(fixture.homeTeam) || !ids.has(fixture.awayTeam)) throw new Error(`Fixture ${fixture.id} references an unknown team`);
    if (fixture.homeTeam === fixture.awayTeam) throw new Error(`Fixture ${fixture.id} has the same home and away team`);
    if (fixture.homeWinProb < 0 || fixture.drawProb < 0 || fixture.awayWinProb < 0) throw new Error(`Fixture ${fixture.id} has a negative match probability`);
    if (Math.abs(fixture.homeWinProb + fixture.drawProb + fixture.awayWinProb - 1) > 1e-8) throw new Error(`Fixture ${fixture.id} match probabilities must sum to 1`);
>>>>>>> 629b3fe (feat: version competition rules and simulated goals)
  }
}

function poissonDistribution(lambda: number): number[] {
  const result: number[] = [];
  let probability = Math.exp(-Math.max(0, lambda));
  for (let goals = 0; goals <= MAX_GOALS; goals++) {
    if (goals > 0) probability *= Math.max(0, lambda) / goals;
    result.push(probability);
>>>>>>> 629b3fe (feat: version competition rules and simulated goals)
  }
  const total = result.reduce((sum, value) => sum + value, 0);
  return total ? result.map((value) => value / total) : [1];
}

function validGoalProbabilities(probabilities: number[] | undefined): number[] | null {
  if (!probabilities?.length || probabilities.some((probability) => probability < 0 || !Number.isFinite(probability))) return null;
  const total = probabilities.reduce((sum, probability) => sum + probability, 0);
  return total > 0 ? probabilities.map((probability) => probability / total) : null;
}

type ScoreCandidate = { homeGoals: number; awayGoals: number; probability: number };
type ScoreSampler = Record<MatchResult, ScoreCandidate[]>;

function createScoreSampler(fixture: Fixture): ScoreSampler {
  const homeProbabilities = validGoalProbabilities(fixture.homeGoalProbabilities) ?? poissonDistribution(fixture.expectedHomeGoals ?? DEFAULT_HOME_GOALS);
  const awayProbabilities = validGoalProbabilities(fixture.awayGoalProbabilities) ?? poissonDistribution(fixture.expectedAwayGoals ?? DEFAULT_AWAY_GOALS);
  const candidates: ScoreSampler = { home: [], draw: [], away: [] };
  for (let homeGoals = 0; homeGoals < homeProbabilities.length; homeGoals++) {
    for (let awayGoals = 0; awayGoals < awayProbabilities.length; awayGoals++) {
      const outcome = homeGoals > awayGoals ? "home" : homeGoals === awayGoals ? "draw" : "away";
      candidates[outcome].push({ homeGoals, awayGoals, probability: homeProbabilities[homeGoals] * awayProbabilities[awayGoals] });
    }
  }
  return candidates;
}

function scoreForResult(sampler: ScoreSampler, result: MatchResult, random: () => number): { homeGoals: number; awayGoals: number } {
  const candidates = sampler[result];
  const total = candidates.reduce((sum, candidate) => sum + candidate.probability, 0);
  if (!total) return result === "home" ? { homeGoals: 1, awayGoals: 0 } : result === "away" ? { homeGoals: 0, awayGoals: 1 } : { homeGoals: 0, awayGoals: 0 };
  let threshold = random() * total;
  for (const candidate of candidates) {
    threshold -= candidate.probability;
    if (threshold < 0) return { homeGoals: candidate.homeGoals, awayGoals: candidate.awayGoals };
  }
  const last = candidates[candidates.length - 1];
  return { homeGoals: last.homeGoals, awayGoals: last.awayGoals };
}

function createHeadToHead(data: HeadToHeadData | undefined, teamId: string): Record<string, { played: number; points: number; goalsFor: number; goalsAgainst: number }> | undefined {
  if (!data) return undefined;
  return Object.fromEntries(Object.entries(data[teamId] ?? {}).map(([opponent, stats]) => [opponent, { ...stats }]));
}

function createState(teams: Team[], headToHead?: HeadToHeadData): Record<string, TeamState> {
  return Object.fromEntries(teams.map((team) => [team.id, {
    teamId: team.id, name: team.name, points: team.points, played: team.played,
    goalsFor: team.goalsFor, goalsAgainst: team.goalsAgainst,
    goalDifference: team.goalsFor - team.goalsAgainst,
    headToHead: createHeadToHead(headToHead, team.id),
  }]));
}

function sampleMatch(fixture: Fixture, sampler: ScoreSampler, random: () => number): { result: MatchResult; homeGoals: number; awayGoals: number } {
  const value = random();
  const result: MatchResult = value < fixture.homeWinProb ? "home" : value < fixture.homeWinProb + fixture.drawProb ? "draw" : "away";
  return { result, ...scoreForResult(sampler, result, random) };
}

function updateHeadToHead(state: Record<string, TeamState>, fixture: Fixture, result: MatchResult, homeGoals: number, awayGoals: number, rules: CompetitionRules): void {
  const home = state[fixture.homeTeam].headToHead?.[fixture.awayTeam];
  const away = state[fixture.awayTeam].headToHead?.[fixture.homeTeam];
  if (!home || !away) return;
  home.played += 1; away.played += 1;
  home.goalsFor += homeGoals; home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;
  if (result === "home") { home.points += rules.pointsForWin; away.points += rules.pointsForLoss; }
  else if (result === "draw") { home.points += rules.pointsForDraw; away.points += rules.pointsForDraw; }
  else { home.points += rules.pointsForLoss; away.points += rules.pointsForWin; }
}

function applyMatch(state: Record<string, TeamState>, fixture: Fixture, result: MatchResult, homeGoals: number, awayGoals: number, rules: CompetitionRules): void {
  const home = state[fixture.homeTeam];
  const away = state[fixture.awayTeam];
  home.played += 1; away.played += 1;
  home.goalsFor += homeGoals; home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;
  home.goalDifference = home.goalsFor - home.goalsAgainst; away.goalDifference = away.goalsFor - away.goalsAgainst;
  if (result === "home") { home.points += rules.pointsForWin; away.points += rules.pointsForLoss; }
  else if (result === "draw") { home.points += rules.pointsForDraw; away.points += rules.pointsForDraw; }
  else { home.points += rules.pointsForLoss; away.points += rules.pointsForWin; }
  updateHeadToHead(state, fixture, result, homeGoals, awayGoals, rules);
}

function currentStandings(state: Record<string, TeamState>): SimulatedStanding[] {
  return Object.values(state).map((standing) => ({
    teamId: standing.teamId,
    points: standing.points,
    played: standing.played,
    goalsFor: standing.goalsFor,
    goalsAgainst: standing.goalsAgainst,
    goalDifference: standing.goalDifference,
    headToHead: standing.headToHead,
  }));
}

function fixtureDates(fixtures: Fixture[]): string[] {
  return [...new Set(fixtures.map((fixture) => fixture.date))].sort();
}

function fixtureRound(fixtures: Fixture[], date: string): number {
  const rounds = fixtures.filter((fixture) => fixture.date === date).map((fixture) => fixture.round);
  return rounds.length ? Math.min(...rounds) : 0;
}

function resultDateRows(team: Team, fixtures: Fixture[], championshipCounts: Record<string, Record<string, number>>, iterations: number): DateProbability[] {
  let cumulative = 0;
  return fixtureDates(fixtures).map((date) => {
    const teamFixture = fixtures.find((fixture) => fixture.date === date && (fixture.homeTeam === team.id || fixture.awayTeam === team.id));
    const probability = (championshipCounts[team.id][date] ?? 0) / iterations;
    cumulative += probability;
    return {
      date, round: fixtureRound(fixtures, date), probability, cumulativeProbability: cumulative,
      opponent: teamFixture ? (teamFixture.homeTeam === team.id ? teamFixture.awayTeam : teamFixture.homeTeam) : "vrij",
      isHome: teamFixture?.homeTeam === team.id,
    };
  });
}

export function runSimulation(iterations: number = 50000, teams: Team[] = [], remainingFixtures: Fixture[] = [], totalRounds: number = 34, options: SimulationOptions = {}): LeagueSimulationResult {
  void totalRounds;
  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error("Simulation iterations must be a positive integer");
  const rules = options.rules ?? eredivisieRules;
  const fixtures = sortedFixtures(remainingFixtures);
  validateFixtures(teams, fixtures);
  rules.validate(teams, options.headToHead);
  const seed = options.seed ?? DEFAULT_SEED;
  const allDates = fixtureDates(fixtures);
  const fixturesByDate = new Map(allDates.map((date) => [date, fixtures.filter((fixture) => fixture.date === date)]));
  const futureFixturesByDate = new Map(allDates.map((date) => [date, fixtures.filter((fixture) => fixture.date > date)]));
  const remainingCountsByDate = new Map(allDates.map((date) => {
    const counts: Record<string, number> = Object.fromEntries(teams.map((team) => [team.id, 0]));
    for (const fixture of fixtures) {
      if (fixture.date > date) {
        counts[fixture.homeTeam] += 1;
        counts[fixture.awayTeam] += 1;
      }
    }
    return [date, counts] as const;
  }));
  const scoreSamplers = new Map(fixtures.map((fixture) => [fixture.id, createScoreSampler(fixture)]));
  const championshipCounts: Record<string, Record<string, number>> = Object.fromEntries(teams.map((team) => [team.id, {}]));
  const neverChampion: Record<string, number> = Object.fromEntries(teams.map((team) => [team.id, 0]));
  const positionCounts: Record<string, Record<number, number>> = Object.fromEntries(teams.map((team) => [team.id, {}]));
  const tieCounts: Record<string, number> = Object.fromEntries(teams.map((team) => [team.id, 0]));
  const championCounts: Record<string, number> = Object.fromEntries(teams.map((team) => [team.id, 0]));
  const goalSums: Record<string, { goalsFor: number; goalsAgainst: number }> = Object.fromEntries(teams.map((team) => [team.id, { goalsFor: 0, goalsAgainst: 0 }]));
  let seededTieBreakCount = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const random = seededRandom((seed + iteration) >>> 0);
    const state = createState(teams, options.headToHead);
    const championDate: Record<string, string | null> = Object.fromEntries(teams.map((team) => [team.id, null]));
    for (const date of allDates) {
      for (const fixture of fixturesByDate.get(date) ?? []) {
        const match = sampleMatch(fixture, scoreSamplers.get(fixture.id)!, random);
        applyMatch(state, fixture, match.result, match.homeGoals, match.awayGoals, rules);
>>>>>>> 629b3fe (feat: version competition rules and simulated goals)
      }
      const futureFixtures = futureFixturesByDate.get(date) ?? [];
      const standings = currentStandings(state);
      for (const team of teams) {
        if (championDate[team.id] === null && rules.isChampionClinched(state[team.id], standings.filter((standing) => standing.teamId !== team.id), futureFixtures, remainingCountsByDate.get(date))) championDate[team.id] = date;
      }
    }
    for (const team of teams) {
      const standing = state[team.id];
      goalSums[team.id].goalsFor += standing.goalsFor; goalSums[team.id].goalsAgainst += standing.goalsAgainst;
      if (championDate[team.id]) {
        const date = championDate[team.id]!;
        championshipCounts[team.id][date] = (championshipCounts[team.id][date] ?? 0) + 1;
      } else neverChampion[team.id] += 1;
    }
    const standings = currentStandings(state);
    const unresolvedGroups = rules.rankStandings(standings);
    const groups = rules.rankStandings(standings, random);
    if (groups[0]?.standings.length === 1) championCounts[groups[0].standings[0].teamId] += 1;
    if (!rules.config.requireUniqueRanking) {
      for (const group of unresolvedGroups.filter((group) => group.tied)) for (const standing of group.standings) tieCounts[standing.teamId] += 1;
    }
    if (rules.config.requireUniqueRanking) {
      seededTieBreakCount += unresolvedGroups.filter((group) => group.tied).reduce((count, group) => count + group.standings.length - 1, 0);
    }
    for (const group of groups) for (const standing of group.standings) positionCounts[standing.teamId][group.position] = (positionCounts[standing.teamId][group.position] ?? 0) + 1;
  }

  const clubResults: Record<string, ClubSimulationResult> = {};
  for (const team of teams) {
    const dateProbabilities = resultDateRows(team, fixtures, championshipCounts, iterations);
    const championshipProbability = championCounts[team.id] / iterations;
    const expectedDate = championshipProbability > 0 ? dateProbabilities.reduce<DateProbability | null>((best, current) => current.probability > (best?.probability ?? 0) ? current : best, null)?.date ?? null : null;
    const positionProbabilities: Record<number, number> = {};
    for (const [position, count] of Object.entries(positionCounts[team.id])) positionProbabilities[Number(position)] = count / iterations;
    const goalsFor = goalSums[team.id].goalsFor / iterations;
    const goalsAgainst = goalSums[team.id].goalsAgainst / iterations;
    clubResults[team.id] = {
      teamId: team.id, teamName: team.name, totalChampionshipProbability: championshipProbability,
      dateProbabilities, bestCaseDate: null, bestCaseRound: null, expectedDate,
      neverChampionProbability: neverChampion[team.id] / iterations, neverChampionCount: neverChampion[team.id],
      noClinchProbability: neverChampion[team.id] / iterations, tieProbability: tieCounts[team.id] / iterations,
      positionProbabilities, simulatedGoalsFor: goalsFor, simulatedGoalsAgainst: goalsAgainst,
      simulatedGoalDifference: goalsFor - goalsAgainst,
    };
  }

  for (const team of teams) {
    const bestState = createState(teams, options.headToHead);
    let bestCaseDate: string | null = null;
    let bestCaseRound: number | null = null;
    for (const date of allDates) {
      for (const fixture of fixturesByDate.get(date) ?? []) {
        const involvesTeam = fixture.homeTeam === team.id || fixture.awayTeam === team.id;
        if (involvesTeam) applyMatch(bestState, fixture, fixture.homeTeam === team.id ? "home" : "away", fixture.homeTeam === team.id ? 1 : 0, fixture.awayTeam === team.id ? 1 : 0, rules);
        else { bestState[fixture.homeTeam].played += 1; bestState[fixture.awayTeam].played += 1; }
      }
      if (bestCaseDate === null && rules.isChampionClinched(bestState[team.id], currentStandings(bestState).filter((standing) => standing.teamId !== team.id), futureFixturesByDate.get(date) ?? [], remainingCountsByDate.get(date))) {
        bestCaseDate = date; bestCaseRound = fixtureRound(fixtures, date);
      }
    }
    clubResults[team.id].bestCaseDate = bestCaseDate;
    clubResults[team.id].bestCaseRound = bestCaseRound;
  }

  return { clubResults, iterations, seed, rulesVersion: rules.version, fixtureOrder: fixtures.map((fixture) => fixture.id), seededTieBreakCount };
}

export function runPrediction(input: PredictionRunInput): LeagueSimulationResult {
  const teams = [...input.teams].sort((a, b) => a.id.localeCompare(b.id));
  const fixtures = input.fixtures.map((fixture) => ({
    ...fixture,
    ...input.model.predict(fixture, teams),
  }));
  const result = runSimulation(
    input.iterations,
    teams,
    fixtures,
    input.totalRounds,
    { seed: input.seed }
  );

  return {
    ...result,
    metadata: {
      modelVersion: input.model.version,
      competition: input.competition,
      season: input.season,
      standingsSnapshotId: input.standingsSnapshotId,
      fixturesSnapshotId: input.fixturesSnapshotId,
      seed: input.seed,
      iterations: input.iterations,
    },
  };
}
