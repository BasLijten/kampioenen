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

export interface Fixture {
  id: string;
  date: string; // ISO date string
  round: number;
  homeTeam: string;
  awayTeam: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  isPSV: boolean;
  source: "api" | "poisson";
}

export const TOTAL_ROUNDS = 34;
export const PSV_TEAM_ID = "psv";

export const teams: Team[] = [
  { id: "psv", name: "PSV Eindhoven", shortName: "PSV", points: 71, played: 28, won: 22, drawn: 5, lost: 1, goalsFor: 84, goalsAgainst: 28 },
  { id: "ajax", name: "Ajax", shortName: "Ajax", points: 61, played: 28, won: 18, drawn: 7, lost: 3, goalsFor: 68, goalsAgainst: 32 },
  { id: "feyenoord", name: "Feyenoord", shortName: "Feyenoord", points: 58, played: 28, won: 17, drawn: 7, lost: 4, goalsFor: 62, goalsAgainst: 35 },
  { id: "az", name: "AZ Alkmaar", shortName: "AZ", points: 53, played: 28, won: 15, drawn: 8, lost: 5, goalsFor: 57, goalsAgainst: 38 },
  { id: "utrecht", name: "FC Utrecht", shortName: "Utrecht", points: 46, played: 28, won: 13, drawn: 7, lost: 8, goalsFor: 51, goalsAgainst: 45 },
  { id: "twente", name: "FC Twente", shortName: "Twente", points: 43, played: 28, won: 12, drawn: 7, lost: 9, goalsFor: 47, goalsAgainst: 44 },
];

export const remainingFixtures: Fixture[] = [
  // Round 29 - March 8
  { id: "r29-1", date: "2025-03-08", round: 29, homeTeam: "psv", awayTeam: "utrecht", homeWinProb: 0.78, drawProb: 0.14, awayWinProb: 0.08, isPSV: true, source: "poisson" },
  { id: "r29-2", date: "2025-03-08", round: 29, homeTeam: "ajax", awayTeam: "twente", homeWinProb: 0.62, drawProb: 0.22, awayWinProb: 0.16, isPSV: false, source: "poisson" },
  { id: "r29-3", date: "2025-03-08", round: 29, homeTeam: "az", awayTeam: "feyenoord", homeWinProb: 0.38, drawProb: 0.26, awayWinProb: 0.36, isPSV: false, source: "poisson" },

  // Round 30 - March 15
  { id: "r30-1", date: "2025-03-15", round: 30, homeTeam: "feyenoord", awayTeam: "psv", homeWinProb: 0.22, drawProb: 0.18, awayWinProb: 0.60, isPSV: true, source: "poisson" },
  { id: "r30-2", date: "2025-03-15", round: 30, homeTeam: "twente", awayTeam: "ajax", homeWinProb: 0.30, drawProb: 0.28, awayWinProb: 0.42, isPSV: false, source: "poisson" },
  { id: "r30-3", date: "2025-03-15", round: 30, homeTeam: "utrecht", awayTeam: "az", homeWinProb: 0.40, drawProb: 0.30, awayWinProb: 0.30, isPSV: false, source: "poisson" },

  // Round 31 - March 22
  { id: "r31-1", date: "2025-03-22", round: 31, homeTeam: "psv", awayTeam: "az", homeWinProb: 0.72, drawProb: 0.16, awayWinProb: 0.12, isPSV: true, source: "poisson" },
  { id: "r31-2", date: "2025-03-22", round: 31, homeTeam: "ajax", awayTeam: "feyenoord", homeWinProb: 0.44, drawProb: 0.24, awayWinProb: 0.32, isPSV: false, source: "poisson" },
  { id: "r31-3", date: "2025-03-22", round: 31, homeTeam: "twente", awayTeam: "utrecht", homeWinProb: 0.48, drawProb: 0.28, awayWinProb: 0.24, isPSV: false, source: "poisson" },

  // Round 32 - April 5
  { id: "r32-1", date: "2025-04-05", round: 32, homeTeam: "az", awayTeam: "ajax", homeWinProb: 0.34, drawProb: 0.26, awayWinProb: 0.40, isPSV: false, source: "poisson" },
  { id: "r32-2", date: "2025-04-05", round: 32, homeTeam: "utrecht", awayTeam: "psv", homeWinProb: 0.10, drawProb: 0.16, awayWinProb: 0.74, isPSV: true, source: "poisson" },
  { id: "r32-3", date: "2025-04-05", round: 32, homeTeam: "feyenoord", awayTeam: "twente", homeWinProb: 0.58, drawProb: 0.24, awayWinProb: 0.18, isPSV: false, source: "poisson" },

  // Round 33 - April 12
  { id: "r33-1", date: "2025-04-12", round: 33, homeTeam: "psv", awayTeam: "ajax", homeWinProb: 0.58, drawProb: 0.22, awayWinProb: 0.20, isPSV: true, source: "poisson" },
  { id: "r33-2", date: "2025-04-12", round: 33, homeTeam: "feyenoord", awayTeam: "az", homeWinProb: 0.52, drawProb: 0.24, awayWinProb: 0.24, isPSV: false, source: "poisson" },
  { id: "r33-3", date: "2025-04-12", round: 33, homeTeam: "twente", awayTeam: "utrecht", homeWinProb: 0.46, drawProb: 0.28, awayWinProb: 0.26, isPSV: false, source: "poisson" },

  // Round 34 - April 19
  { id: "r34-1", date: "2025-04-19", round: 34, homeTeam: "ajax", awayTeam: "psv", homeWinProb: 0.26, drawProb: 0.20, awayWinProb: 0.54, isPSV: true, source: "poisson" },
  { id: "r34-2", date: "2025-04-19", round: 34, homeTeam: "az", awayTeam: "twente", homeWinProb: 0.48, drawProb: 0.28, awayWinProb: 0.24, isPSV: false, source: "poisson" },
  { id: "r34-3", date: "2025-04-19", round: 34, homeTeam: "utrecht", awayTeam: "feyenoord", homeWinProb: 0.30, drawProb: 0.26, awayWinProb: 0.44, isPSV: false, source: "poisson" },
];
