export interface LeagueConfig {
  id: string;
  name: string;
  season: string;
  totalRounds: number;
  language: string;
  locale: string;
  footballDataOrgCode: string;
  apiFootballLeagueId: number;
  apiFootballSeason: number;
  bzzoiroLeagueFilter: (league: { api_id?: number; name?: string }) => boolean;
  dataDir: string;
}

/** Serializable subset of LeagueConfig safe for client components */
export type LeagueClientConfig = Omit<LeagueConfig, "bzzoiroLeagueFilter">;

export const leagues: Record<string, LeagueConfig> = {
  eredivisie: {
    id: "eredivisie",
    name: "Eredivisie",
    season: "2025/26",
    totalRounds: 34,
    language: "nl",
    locale: "nl-NL",
    footballDataOrgCode: "DED",
    apiFootballLeagueId: 88,
    apiFootballSeason: 2025,
    bzzoiroLeagueFilter: (league) =>
      league.api_id === 88 || (league.name ?? "").toLowerCase().includes("eredivisie"),
    dataDir: "data/eredivisie",
  },
};
