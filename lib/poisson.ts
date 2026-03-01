import { Team } from "./data";

export interface TeamStrength {
  attack: number;
  defense: number;
}

const HOME_ADVANTAGE = 1.35;
const MAX_GOALS = 8;

export function computeLeagueAvgGoals(teams: Team[]): number {
  const totalGoals = teams.reduce((sum, t) => sum + t.goalsFor, 0);
  const totalMatches = teams.reduce((sum, t) => sum + t.played, 0) / 2;
  return totalGoals / totalMatches / 2; // avg goals per team per match
}

export function computeTeamStrengths(teams: Team[]): Map<string, TeamStrength> {
  const leagueAvg = computeLeagueAvgGoals(teams);
  const strengths = new Map<string, TeamStrength>();

  for (const team of teams) {
    const attack = team.goalsFor / team.played / leagueAvg;
    const defense = team.goalsAgainst / team.played / leagueAvg;
    strengths.set(team.id, { attack, defense });
  }

  return strengths;
}

/** Poisson probability: P(X = k) = (λ^k * e^-λ) / k! */
function poissonPmf(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

export function predictMatch(
  homeId: string,
  awayId: string,
  strengths: Map<string, TeamStrength>,
  leagueAvg: number
): { homeWinProb: number; drawProb: number; awayWinProb: number } {
  const home = strengths.get(homeId);
  const away = strengths.get(awayId);

  if (!home || !away) {
    // Unknown team — return flat prior
    return { homeWinProb: 0.45, drawProb: 0.25, awayWinProb: 0.30 };
  }

  const homeLambda = home.attack * away.defense * leagueAvg * HOME_ADVANTAGE;
  const awayLambda = away.attack * home.defense * leagueAvg;

  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      const p = poissonPmf(homeLambda, hg) * poissonPmf(awayLambda, ag);
      if (hg > ag) homeWinProb += p;
      else if (hg === ag) drawProb += p;
      else awayWinProb += p;
    }
  }

  // Normalize to ensure probabilities sum to 1
  const total = homeWinProb + drawProb + awayWinProb;
  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
  };
}
