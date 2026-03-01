import { Team, Fixture } from "./data";
import { ApiStandingEntry, ApiFixture, ApiPrediction } from "./api-football";
import { computeTeamStrengths, computeLeagueAvgGoals, predictMatch } from "./poisson";

// Maps API-Football team names → onze interne IDs
const TEAM_ID_MAP: Record<string, string> = {
  "PSV Eindhoven": "psv",
  "PSV": "psv",
  "Ajax": "ajax",
  "Feyenoord": "feyenoord",
  "AZ Alkmaar": "az",
  "AZ": "az",
  "FC Utrecht": "utrecht",
  "Utrecht": "utrecht",
  "FC Twente": "twente",
  "Twente": "twente",
};

const SHORT_NAME_MAP: Record<string, string> = {
  "PSV Eindhoven": "PSV",
  "PSV": "PSV",
  "Ajax": "Ajax",
  "Feyenoord": "Feyenoord",
  "AZ Alkmaar": "AZ",
  "AZ": "AZ",
  "FC Utrecht": "Utrecht",
  "Utrecht": "Utrecht",
  "FC Twente": "Twente",
  "Twente": "Twente",
};

function toTeamId(name: string): string {
  return TEAM_ID_MAP[name] ?? name.toLowerCase().replace(/\s+/g, "-");
}

// "Regular Season - 29" → 29
function roundFromString(roundStr: string): number {
  const match = roundStr.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// "75%" → 0.75
function parsePct(str: string): number {
  return parseInt(str.replace("%", ""), 10) / 100;
}

export function transformStandings(standings: ApiStandingEntry[]): Team[] {
  return standings.map((s) => ({
    id: toTeamId(s.team.name),
    name: s.team.name,
    shortName: SHORT_NAME_MAP[s.team.name] ?? s.team.name,
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
  predictions: Map<number, ApiPrediction>,
  teams: Team[]
): Fixture[] {
  const strengths = computeTeamStrengths(teams);
  const leagueAvg = computeLeagueAvgGoals(teams);

  return fixtures.map((f) => {
    const homeTeamId = toTeamId(f.teams.home.name);
    const awayTeamId = toTeamId(f.teams.away.name);

    const pred = predictions.get(f.fixture.id);
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
      id: `api-${f.fixture.id}`,
      date: f.fixture.date.split("T")[0],
      round: roundFromString(f.league.round),
      homeTeam: homeTeamId,
      awayTeam: awayTeamId,
      homeWinProb,
      drawProb,
      awayWinProb,
      isPSV: homeTeamId === "psv" || awayTeamId === "psv",
      source,
    };
  });
}
