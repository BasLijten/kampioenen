import { leagues, type LeagueConfig, type LeagueClientConfig } from "./leagues";
import { clubs, getClubTexts, type ClubConfig } from "./clubs";
import type { LocaleStrings } from "./locales/nl";

export type { LeagueClientConfig };

export interface ResolvedConfig {
  league: LeagueConfig;
  club: ClubConfig;
  texts: LocaleStrings;
}

/** Strip non-serializable fields from league config for client components */
export function toClientLeague(league: LeagueConfig): LeagueClientConfig {
  const { bzzoiroLeagueFilter: _, ...client } = league;
  return client;
}

export function resolveLeague(): LeagueConfig {
  const leagueId = process.env.TARGET_LEAGUE;
  if (!leagueId) {
    throw new Error(
      "TARGET_LEAGUE env var is required. Set it to one of: " +
        Object.keys(leagues).join(", ")
    );
  }
  const league = leagues[leagueId];
  if (!league) {
    throw new Error(
      `Unknown league "${leagueId}". Available: ${Object.keys(leagues).join(", ")}`
    );
  }
  return league;
}

export function resolveClub(): ClubConfig {
  const clubId = process.env.TARGET_CLUB;
  if (!clubId) {
    throw new Error(
      "TARGET_CLUB env var is required. Set it to one of: " +
        Object.keys(clubs).join(", ")
    );
  }
  const club = clubs[clubId];
  if (!club) {
    throw new Error(
      `Unknown club "${clubId}". Available: ${Object.keys(clubs).join(", ")}`
    );
  }
  return club;
}

export function resolveConfig(): ResolvedConfig {
  const league = resolveLeague();
  const club = resolveClub();
  if (club.leagueId !== league.id) {
    throw new Error(
      `Club "${club.id}" belongs to league "${club.leagueId}", but TARGET_LEAGUE is "${league.id}"`
    );
  }
  const texts = getClubTexts(club);
  return { league, club, texts };
}

export function formatTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
