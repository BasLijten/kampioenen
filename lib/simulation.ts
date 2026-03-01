import { teams as staticTeams, remainingFixtures as staticFixtures, Team, Fixture } from "./data";

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

interface TeamState {
  [teamId: string]: { points: number; played: number };
}

function simulateMatch(homeWinProb: number, drawProb: number): "home" | "draw" | "away" {
  const rand = Math.random();
  if (rand < homeWinProb) return "home";
  if (rand < homeWinProb + drawProb) return "draw";
  return "away";
}

function isChampion(teamId: string, state: TeamState, allTeams: Team[], roundFixtures: Fixture[]): boolean {
  const myPoints = state[teamId].points;

  // Check all other teams: can they still catch up?
  for (const team of allTeams) {
    if (team.id === teamId) continue;
    const otherPoints = state[team.id].points;
    const otherPlayed = state[team.id].played;
    const otherRemaining = 34 - otherPlayed;
    const otherMax = otherPoints + otherRemaining * 3;
    if (otherMax >= myPoints) return false;
  }
  return true;
}

export function runSimulation(
  iterations: number = 50000,
  teams: Team[] = staticTeams,
  remainingFixtures: Fixture[] = staticFixtures
): SimulationResult {
  const rounds = [...new Set(remainingFixtures.map((f) => f.round))].sort((a, b) => a - b);
  const roundDates: Record<number, string> = {};
  rounds.forEach((r) => {
    const psvFix = remainingFixtures.find((f) => f.round === r && f.isPSV);
    const fix = psvFix || remainingFixtures.find((f) => f.round === r);
    if (fix) roundDates[r] = fix.date;
  });

  const championshipCounts: Record<string, number> = {};
  let neverChampion = 0;

  for (let i = 0; i < iterations; i++) {
    // Initialize state
    const state: TeamState = {};
    teams.forEach((t) => {
      state[t.id] = { points: t.points, played: t.played };
    });

    let psvChampionRound: number | null = null;

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

      // After this round, check if PSV is champion
      if (psvChampionRound === null && isChampion("psv", state, teams, fixtures)) {
        psvChampionRound = round;
      }
    }

    if (psvChampionRound !== null) {
      const date = roundDates[psvChampionRound];
      championshipCounts[date] = (championshipCounts[date] || 0) + 1;
    } else {
      neverChampion++;
    }
  }

  const totalChampion = iterations - neverChampion;
  const totalProb = totalChampion / iterations;

  // Build date probabilities
  let cumulative = 0;
  const dateProbabilities: DateProbability[] = rounds.map((round) => {
    const date = roundDates[round];
    const count = championshipCounts[date] || 0;
    const prob = count / iterations;
    cumulative += prob;
    const psvFixture = remainingFixtures.find((f) => f.round === round && f.isPSV);
    const opponent = psvFixture
      ? psvFixture.homeTeam === "psv"
        ? psvFixture.awayTeam
        : psvFixture.homeTeam
      : "vrij";
    const isHome = psvFixture ? psvFixture.homeTeam === "psv" : false;
    return { date, round, probability: prob, cumulativeProbability: cumulative, opponent, isHome };
  });

  // Best case: PSV wins all remaining matches
  let bestCaseDate: string | null = null;
  let bestCaseRound: number | null = null;
  const bestState: TeamState = {};
  teams.forEach((t) => { bestState[t.id] = { points: t.points, played: t.played }; });

  for (const round of rounds) {
    const fixtures = remainingFixtures.filter((f) => f.round === round);
    for (const fixture of fixtures) {
      if (fixture.isPSV) {
        if (fixture.homeTeam === "psv") bestState["psv"].points += 3;
        else bestState["psv"].points += 3;
      }
      // Other teams: use expected (home wins if prob > 0.5)
      else {
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
    if (bestCaseRound === null && isChampion("psv", bestState, teams, fixtures)) {
      bestCaseRound = round;
      bestCaseDate = roundDates[round];
    }
  }

  // Expected date: weighted average
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

  return {
    totalChampionshipProbability: totalProb,
    dateProbabilities,
    bestCaseDate,
    bestCaseRound,
    expectedDate,
    neverChampionProbability: neverChampion / iterations,
    iterations,
    neverChampionCount: neverChampion,
  };
}
