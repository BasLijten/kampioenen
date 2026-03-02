import { Team, Fixture } from "./data";

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
}

interface TeamState {
  [teamId: string]: { points: number; played: number };
}

function simulateMatch(homeWinProb: number, drawProb: number): "home" | "draw" | "away" {
  const rand = Math.random();
  if (rand < homeWinProb) return "home";
  if (rand < homeWinProb + drawProb) return "draw";
  return "away";
}

function isChampion(teamId: string, state: TeamState, allTeams: Team[], totalRounds: number): boolean {
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

export function runSimulation(
  iterations: number = 50000,
  teams: Team[] = [],
  remainingFixtures: Fixture[] = [],
  totalRounds: number = 34
): LeagueSimulationResult {
  const rounds = [...new Set(remainingFixtures.map((f) => f.round))].sort((a, b) => a - b);

  // Build round dates per team: for each team, find its fixture in each round
  const roundDates: Record<number, string> = {};
  rounds.forEach((r) => {
    const fix = remainingFixtures.find((f) => f.round === r);
    if (fix) roundDates[r] = fix.date;
  });

  // Track championship counts per team per date
  const championshipCounts: Record<string, Record<string, number>> = {};
  const neverChampion: Record<string, number> = {};
  teams.forEach((t) => {
    championshipCounts[t.id] = {};
    neverChampion[t.id] = 0;
  });

  for (let i = 0; i < iterations; i++) {
    const state: TeamState = {};
    teams.forEach((t) => {
      state[t.id] = { points: t.points, played: t.played };
    });

    // Track which round each team clinched the championship
    const championRound: Record<string, number | null> = {};
    teams.forEach((t) => { championRound[t.id] = null; });

    for (const round of rounds) {
      const fixtures = remainingFixtures.filter((f) => f.round === round);

      for (const fixture of fixtures) {
        const result = simulateMatch(fixture.homeWinProb, fixture.drawProb);
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

      // After this round, check every team that hasn't clinched yet
      for (const team of teams) {
        if (championRound[team.id] === null && isChampion(team.id, state, teams, totalRounds)) {
          championRound[team.id] = round;
        }
      }
    }

    // Record results
    for (const team of teams) {
      if (championRound[team.id] !== null) {
        const date = roundDates[championRound[team.id]!];
        championshipCounts[team.id][date] = (championshipCounts[team.id][date] || 0) + 1;
      } else {
        neverChampion[team.id]++;
      }
    }
  }

  // Build results per club
  const clubResults: Record<string, ClubSimulationResult> = {};

  for (const team of teams) {
    const totalChampion = iterations - neverChampion[team.id];
    const totalProb = totalChampion / iterations;

    // Build date probabilities for this team
    let cumulative = 0;
    const dateProbabilities: DateProbability[] = rounds.map((round) => {
      const date = roundDates[round];
      const count = championshipCounts[team.id][date] || 0;
      const prob = count / iterations;
      cumulative += prob;

      // Find this team's fixture in the round
      const teamFixture = remainingFixtures.find(
        (f) => f.round === round && (f.homeTeam === team.id || f.awayTeam === team.id)
      );
      const opponent = teamFixture
        ? teamFixture.homeTeam === team.id
          ? teamFixture.awayTeam
          : teamFixture.homeTeam
        : "vrij";
      const isHome = teamFixture ? teamFixture.homeTeam === team.id : false;

      return { date, round, probability: prob, cumulativeProbability: cumulative, opponent, isHome };
    });

    // Best case: this team wins all, others get expected results
    let bestCaseDate: string | null = null;
    let bestCaseRound: number | null = null;
    const bestState: TeamState = {};
    teams.forEach((t) => { bestState[t.id] = { points: t.points, played: t.played }; });

    for (const round of rounds) {
      const fixtures = remainingFixtures.filter((f) => f.round === round);
      for (const fixture of fixtures) {
        const isTeamFixture = fixture.homeTeam === team.id || fixture.awayTeam === team.id;
        if (isTeamFixture) {
          // Team wins
          bestState[team.id].points += 3;
        } else {
          // Other teams: use expected outcome
          if (fixture.homeWinProb > 0.5) {
            bestState[fixture.homeTeam].points += 3;
          } else if (fixture.drawProb > fixture.awayWinProb && fixture.drawProb > fixture.homeWinProb) {
            bestState[fixture.homeTeam].points += 1;
            bestState[fixture.awayTeam].points += 1;
          } else {
            bestState[fixture.awayTeam].points += 3;
          }
        }
        bestState[fixture.homeTeam].played += 1;
        bestState[fixture.awayTeam].played += 1;
      }
      if (bestCaseRound === null && isChampion(team.id, bestState, teams, totalRounds)) {
        bestCaseRound = round;
        bestCaseDate = roundDates[round];
      }
    }

    // Expected date: most likely date
    let expectedDate: string | null = null;
    if (totalProb > 0) {
      let maxProb = 0;
      let maxDate = "";
      for (const dp of dateProbabilities) {
        if (dp.probability > maxProb) {
          maxProb = dp.probability;
          maxDate = dp.date;
        }
      }
      expectedDate = maxDate || null;
    }

    clubResults[team.id] = {
      teamId: team.id,
      teamName: team.name,
      totalChampionshipProbability: totalProb,
      dateProbabilities,
      bestCaseDate,
      bestCaseRound,
      expectedDate,
      neverChampionProbability: neverChampion[team.id] / iterations,
      neverChampionCount: neverChampion[team.id],
    };
  }

  return { clubResults, iterations };
}
