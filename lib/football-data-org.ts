import type { ApiStandingEntry, ApiFixture } from "./api-football";

const BASE_URL = "https://api.football-data.org/v4";
const DEFAULT_COMPETITION_CODE = "DED"; // Eredivisie

interface FootballDataStandingRow {
  position: number;
  team: { id: number; name: string };
  points: number;
  goalDifference: number;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface FootballDataStandingsResponse {
  standings?: Array<{
    table?: FootballDataStandingRow[];
  }>;
}

function headers(): Record<string, string> {
  return { "X-Auth-Token": process.env.FOOTBALL_DATA_ORG_KEY! };
}

interface FootballDataMatch {
  matchday: number;
  utcDate: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
}

interface FootballDataMatchesResponse {
  matches?: FootballDataMatch[];
}

export async function fetchFootballDataOrgStandings(): Promise<ApiStandingEntry[]> {
  const token = process.env.FOOTBALL_DATA_ORG_KEY;
  if (!token || token === "your_api_key_here") {
    throw new Error("FOOTBALL_DATA_ORG_KEY ontbreekt");
  }

  const competition = process.env.FOOTBALL_DATA_ORG_COMPETITION ?? DEFAULT_COMPETITION_CODE;
  const res = await fetch(`${BASE_URL}/competitions/${competition}/standings`, {
    headers: headers(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`football-data standings ${res.status}`);

  const json = (await res.json()) as FootballDataStandingsResponse;
  const rows = json.standings?.[0]?.table ?? [];
  return rows.map((row) => ({
    rank: row.position,
    team: { id: row.team.id, name: row.team.name },
    points: row.points,
    goalsDiff: row.goalDifference,
    all: {
      played: row.playedGames,
      win: row.won,
      draw: row.draw,
      lose: row.lost,
      goals: {
        for: row.goalsFor,
        against: row.goalsAgainst,
      },
    },
  }));
}

export async function fetchFootballDataOrgMatches(): Promise<ApiFixture[]> {
  const token = process.env.FOOTBALL_DATA_ORG_KEY;
  if (!token || token === "your_api_key_here") {
    throw new Error("FOOTBALL_DATA_ORG_KEY ontbreekt");
  }

  const competition = process.env.FOOTBALL_DATA_ORG_COMPETITION ?? DEFAULT_COMPETITION_CODE;
  const res = await fetch(
    `${BASE_URL}/competitions/${competition}/matches?status=SCHEDULED,TIMED`,
    { headers: headers(), next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`football-data matches ${res.status}`);

  const json = (await res.json()) as FootballDataMatchesResponse;
  const matches = json.matches ?? [];

  return matches.map((m) => ({
    fixture: {
      id: 0,
      date: m.utcDate,
    },
    league: {
      round: `Regular Season - ${m.matchday}`,
    },
    teams: {
      home: { id: m.homeTeam.id, name: m.homeTeam.name },
      away: { id: m.awayTeam.id, name: m.awayTeam.name },
    },
  }));
}
