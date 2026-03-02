import { Team, Fixture } from "./data";
import { ApiStandingEntry, ApiFixture, ApiPrediction } from "./api-football";
import { computeTeamStrengths, computeLeagueAvgGoals, predictMatch } from "./poisson";

export function toTeamId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function deriveShortName(name: string): string {
  // Remove common prefixes like "FC", "AFC", "SBV"
  const stripped = name.replace(/^(AFC|FC|SBV|SC)\s+/i, "");
  // If the name has multiple words, use the first significant one
  const parts = stripped.split(/\s+/);
  return parts[0];
}

// "Regular Season - 29" -> 29
function roundFromString(roundStr: string): number {
  const match = roundStr.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// "75%" -> 0.75
function parsePct(str: string): number {
  return parseFloat(str.replace("%", "")) / 100;
}

export function transformStandings(standings: ApiStandingEntry[]): Team[] {
  return standings.map((s) => ({
    id: toTeamId(s.team.name),
    name: s.team.name,
    shortName: deriveShortName(s.team.name),
    points: s.points,
    played: s.all.played,
    won: s.all.win,
    drawn: s.all.draw,
    lost: s.all.lose,
    goalsFor: s.all.goals.for,
    goalsAgainst: s.all.goals.against,
  }));
}

export function transformFixtures(
  fixtures: ApiFixture[],
  predictions: Map<string, ApiPrediction>,
  teams: Team[]
): Fixture[] {
  const strengths = computeTeamStrengths(teams);
  const leagueAvg = computeLeagueAvgGoals(teams);

  return fixtures.map((f) => {
    const homeTeamId = toTeamId(f.teams.home.name);
    const awayTeamId = toTeamId(f.teams.away.name);

    const pairKey = `${homeTeamId}:${awayTeamId}`;
    const pred = predictions.get(pairKey);
    let homeWinProb: number;
    let drawProb: number;
    let awayWinProb: number;
    let source: "api" | "poisson";

    if (pred) {
      homeWinProb = parsePct(pred.predictions.percent.home);
      drawProb = parsePct(pred.predictions.percent.draw);
      awayWinProb = parsePct(pred.predictions.percent.away);
      source = "api";
    } else {
      const poisson = predictMatch(homeTeamId, awayTeamId, strengths, leagueAvg);
      homeWinProb = poisson.homeWinProb;
      drawProb = poisson.drawProb;
      awayWinProb = poisson.awayWinProb;
      source = "poisson";
    }

    return {
      id: f.fixture.id ? `api-${f.fixture.id}` : `match-${pairKey}-r${roundFromString(f.league.round)}`,
      date: f.fixture.date.split("T")[0],
      round: roundFromString(f.league.round),
      homeTeam: homeTeamId,
      awayTeam: awayTeamId,
      homeWinProb,
      drawProb,
      awayWinProb,
      source,
    };
  });
}
