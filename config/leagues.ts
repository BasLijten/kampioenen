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
  competitionRules: {
    version: string;
    pointsForWin: number;
    pointsForDraw: number;
    pointsForLoss: number;
    tiebreakers: ("goalDifference" | "goalsFor" | "headToHead")[];
    requireUniqueRanking?: boolean;
  };
}

/** Serializable subset of LeagueConfig safe for client components */
export type LeagueClientConfig = Omit<LeagueConfig, "bzzoiroLeagueFilter">;

export const leagues: Record<string, LeagueConfig> = {
  eredivisie: {
    id: "eredivisie",
    name: "Eredivisie",
    season: "2026/27",
    totalRounds: 34,
    language: "nl",
    locale: "nl-NL",
    footballDataOrgCode: "DED",
    apiFootballLeagueId: 88,
    apiFootballSeason: 2026,
    bzzoiroLeagueFilter: (league) =>
      league.api_id === 88 || (league.name ?? "").toLowerCase().includes("eredivisie"),
    dataDir: "data/eredivisie",
    competitionRules: {
      version: "eredivisie-rules-v1",
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakers: ["goalDifference", "goalsFor"],
    },
  },
};
