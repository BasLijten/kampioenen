export interface Team {
  id: string;
  name: string;
  shortName: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** A provider-independent, normalized remaining match. */
export interface Match {
  id: string;
  date: string; // ISO date string
  round: number;
  homeTeam: string;
  awayTeam: string;
}

/** The normalized competition state consumed by the prediction engine. */
export interface CompetitionInput {
  teams: readonly Team[];
  remainingFixtures: readonly Match[];
  totalRounds: number;
}

export interface MatchProbability {
  home: number;
  draw: number;
  away: number;
}

export interface MatchProbabilityModel {
  predict(match: Match): MatchProbability;
}

/** Legacy fixture shape retained for the existing fetch and UI pipeline. */
export interface Fixture extends Match {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  source: "api" | "poisson";
}
