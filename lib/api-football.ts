/**
 * API-Football v3 client — server-side only (API key stays in process.env)
 * Docs: https://www.api-football.com/documentation-v3
 *
 * Eredivisie: league=88, season=2025
 */

const BASE_URL = "https://v3.football.api-sports.io";
export const LEAGUE_ID = 88;
export const SEASON = 2025;

function headers(): Record<string, string> {
  return { "x-apisports-key": process.env.API_FOOTBALL_KEY! };
}

// ─── Response types ────────────────────────────────────────────────────────

export interface ApiStandingEntry {
  rank: number;
  team: { id: number; name: string };
  points: number;
  goalsDiff: number;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
}

export interface ApiFixture {
  fixture: { id: number; date: string };
  league: { round: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

export interface ApiPrediction {
  predictions: {
    percent: { home: string; draw: string; away: string };
  };
}

// ─── Fetch functions ───────────────────────────────────────────────────────

export async function fetchStandings(): Promise<ApiStandingEntry[]> {
  const res = await fetch(
    `${BASE_URL}/standings?league=${LEAGUE_ID}&season=${SEASON}`,
    { headers: headers(), next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`standings ${res.status}`);
  const json = await res.json();
  return json.response?.[0]?.league?.standings?.[0] ?? [];
}

export async function fetchRemainingFixtures(): Promise<ApiFixture[]> {
  const res = await fetch(
    `${BASE_URL}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&status=NS`,
    { headers: headers(), next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`fixtures ${res.status}`);
  const json = await res.json();
  return json.response ?? [];
}

export async function fetchPredictions(
  fixtureId: number
): Promise<ApiPrediction | null> {
  const res = await fetch(
    `${BASE_URL}/predictions?fixture=${fixtureId}`,
    { headers: headers(), next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.response?.[0] ?? null;
}
