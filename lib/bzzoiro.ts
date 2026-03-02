const BASE_URL = "https://sports.bzzoiro.com/api";

function headers(): Record<string, string> {
  return { Authorization: `Token ${process.env.BZZOIRO_TOKEN!}` };
}

interface PaginatedResponse<T> {
  next: string | null;
  results: T[];
}

interface BzzLeague {
  id: number;
  api_id?: number;
  name?: string;
  round?: string;
}

export interface BzzEvent {
  id: number;
  api_id?: number;
  league: BzzLeague;
  home_team: string;
  away_team: string;
  event_date: string;
}

export interface BzzPrediction {
  id: number;
  event: {
    id: number;
    api_id?: number;
    league: BzzLeague;
    home_team: string;
    away_team: string;
    event_date: string;
  };
  prob_home_win: number;
  prob_draw: number;
  prob_away_win: number;
}

async function fetchAllPages<T>(initialPath: string): Promise<T[]> {
  let nextUrl: string | null = `${BASE_URL}${initialPath}`;
  const all: T[] = [];

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: headers(),
      next: { revalidate: 120 },
    });
    if (!res.ok) throw new Error(`bzzoiro ${res.status} ${nextUrl}`);

    const json = (await res.json()) as PaginatedResponse<T>;
    all.push(...(json.results ?? []));
    nextUrl = json.next;
  }

  return all;
}

export async function fetchUpcomingEvents(
  leagueFilter: (league: { api_id?: number; name?: string }) => boolean
): Promise<BzzEvent[]> {
  const events = await fetchAllPages<BzzEvent>("/events/?status=notstarted");
  return events.filter((event) => leagueFilter(event.league));
}

export async function fetchUpcomingPredictions(
  leagueFilter: (league: { api_id?: number; name?: string }) => boolean
): Promise<BzzPrediction[]> {
  const predictions = await fetchAllPages<BzzPrediction>("/predictions/?upcoming=true");
  return predictions.filter((prediction) => leagueFilter(prediction.event?.league));
}
