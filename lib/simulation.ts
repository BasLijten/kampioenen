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
  positionProbabilities: Record<number, number>;
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

  // Group fixtures by date (sorted), so we can check clinch after each match day
  const allDates = [...new Set(remainingFixtures.map((f) => f.date))].sort();
  const fixturesByDate: Record<string, Fixture[]> = {};
  for (const date of allDates) {
    fixturesByDate[date] = remainingFixtures.filter((f) => f.date === date);
  }

  // Map each date to its round
  const dateToRound: Record<string, number> = {};
  for (const f of remainingFixtures) {
    dateToRound[f.date] = f.round;
  }

  // Track championship counts per team per date
  const championshipCounts: Record<string, Record<string, number>> = {};
  const neverChampion: Record<string, number> = {};
  const positionCounts: Record<string, Record<number, number>> = {};
  teams.forEach((t) => {
    championshipCounts[t.id] = {};
    neverChampion[t.id] = 0;
    positionCounts[t.id] = {};
  });

  for (let i = 0; i < iterations; i++) {
    const state: TeamState = {};
    teams.forEach((t) => {
      state[t.id] = { points: t.points, played: t.played };
    });

    // Track which date each team clinched the championship
    const championDate: Record<string, string | null> = {};
    teams.forEach((t) => { championDate[t.id] = null; });

    for (const date of allDates) {
      for (const fixture of fixturesByDate[date]) {
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

      // After this date's matches, check every team that hasn't clinched yet
      for (const team of teams) {
        if (championDate[team.id] === null && isChampion(team.id, state, teams, totalRounds)) {
          championDate[team.id] = date;
        }
      }
    }

    // Record results
    for (const team of teams) {
      if (championDate[team.id] !== null) {
        const date = championDate[team.id]!;
        championshipCounts[team.id][date] = (championshipCounts[team.id][date] || 0) + 1;
      } else {
        neverChampion[team.id]++;
      }
    }

    // Record final positions (sort by points, then initial GD as tiebreaker)
    const finalRanking = [...teams].sort((a, b) => {
      const pa = state[a.id].points;
      const pb = state[b.id].points;
      if (pb !== pa) return pb - pa;
      return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
    });
    finalRanking.forEach((t, idx) => {
      const pos = idx + 1;
      positionCounts[t.id][pos] = (positionCounts[t.id][pos] || 0) + 1;
    });
  }

  // Build results per club
  const clubResults: Record<string, ClubSimulationResult> = {};

  for (const team of teams) {
    const totalChampion = iterations - neverChampion[team.id];
    const totalProb = totalChampion / iterations;

    // Build date probabilities per round (using team's own fixture date per round)
    let cumulative = 0;
    const dateProbabilities: DateProbability[] = rounds.map((round) => {
      // Find this team's fixture in the round
      const teamFixture = remainingFixtures.find(
        (f) => f.round === round && (f.homeTeam === team.id || f.awayTeam === team.id)
      );
      const teamDate = teamFixture?.date;
      const opponent = teamFixture
        ? teamFixture.homeTeam === team.id
          ? teamFixture.awayTeam
          : teamFixture.homeTeam
        : "vrij";
      const isHome = teamFixture ? teamFixture.homeTeam === team.id : false;

      // Sum clinch counts for all dates within this round
      const roundFixtureDates = [...new Set(
        remainingFixtures.filter((f) => f.round === round).map((f) => f.date)
      )];
      let count = 0;
      for (const d of roundFixtureDates) {
        count += championshipCounts[team.id][d] || 0;
      }
      const prob = count / iterations;
      cumulative += prob;

      return { date: teamDate || roundFixtureDates[0], round, probability: prob, cumulativeProbability: cumulative, opponent, isHome };
    });

    // Best case: this team wins all, rivals draw all non-team matches
    // Check after each date (team can clinch when rivals play before them)
    let bestCaseDate: string | null = null;
    let bestCaseRound: number | null = null;
    const bestState: TeamState = {};
    teams.forEach((t) => { bestState[t.id] = { points: t.points, played: t.played }; });

    for (const date of allDates) {
      for (const fixture of fixturesByDate[date]) {
        const isTeamFixture = fixture.homeTeam === team.id || fixture.awayTeam === team.id;
        if (isTeamFixture) {
          // Team wins
          bestState[team.id].points += 3;
        } else {
          // Competitors lose: award 0 points so rivals stay at their current total.
          // played still increments below, which correctly shrinks their remaining games.
        }
        bestState[fixture.homeTeam].played += 1;
        bestState[fixture.awayTeam].played += 1;
      }
      if (bestCaseRound === null && isChampion(team.id, bestState, teams, totalRounds)) {
        bestCaseRound = dateToRound[date];
        bestCaseDate = date;
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

    const positionProbabilities: Record<number, number> = {};
    for (const [posStr, count] of Object.entries(positionCounts[team.id])) {
      positionProbabilities[Number(posStr)] = count / iterations;
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
      positionProbabilities,
    };
  }

  return { clubResults, iterations };
}
