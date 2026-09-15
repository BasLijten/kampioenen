import type { Fixture, Team } from "./data";

export type Tiebreaker = "goalDifference" | "goalsFor" | "headToHead";

export interface CompetitionRulesConfig {
  version: string;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  tiebreakers: Tiebreaker[];
  requireUniqueRanking?: boolean;
}

export interface HeadToHeadStats {
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}

export type HeadToHeadData = Record<string, Record<string, HeadToHeadStats>>;

export interface SimulatedStanding {
  teamId: string;
  points: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  headToHead?: Record<string, HeadToHeadStats>;
}

export interface RankingGroup {
  position: number;
  standings: SimulatedStanding[];
  tied: boolean;
}

export interface CompetitionRules {
  readonly config: CompetitionRulesConfig;
  readonly version: string;
  readonly pointsForWin: number;
  readonly pointsForDraw: number;
  readonly pointsForLoss: number;
  readonly requiresHeadToHead: boolean;
  compareTeams(a: SimulatedStanding, b: SimulatedStanding): number;
  rankStandings(standings: SimulatedStanding[], random?: () => number): RankingGroup[];
  isChampionClinched(
    leader: SimulatedStanding,
    competitors: SimulatedStanding[],
    remainingFixtures: Fixture[],
    remainingFixtureCounts?: Record<string, number>
  ): boolean;
  validate(teams: Team[], headToHead?: HeadToHeadData): void;
}

function compareNumbersDescending(a: number, b: number): number {
  return b - a;
}

function compareHeadToHead(a: SimulatedStanding, b: SimulatedStanding): number {
  const aStats = a.headToHead?.[b.teamId];
  const bStats = b.headToHead?.[a.teamId];
  if (!aStats || !bStats) return 0;

  return (
    compareNumbersDescending(aStats.points, bStats.points) ||
    compareNumbersDescending(aStats.goalsFor - aStats.goalsAgainst, bStats.goalsFor - bStats.goalsAgainst) ||
    compareNumbersDescending(aStats.goalsFor, bStats.goalsFor)
  );
}

function hasCompleteHeadToHead(teams: Team[], data?: HeadToHeadData): boolean {
  if (!data) return false;
  return teams.every((team) => teams.every((opponent) => {
    if (team.id === opponent.id) return true;
    const stats = data[team.id]?.[opponent.id];
    return Boolean(
      stats &&
      Number.isInteger(stats.played) && stats.played >= 0 &&
      Number.isFinite(stats.points) && stats.points >= 0 &&
      Number.isFinite(stats.goalsFor) && stats.goalsFor >= 0 &&
      Number.isFinite(stats.goalsAgainst) && stats.goalsAgainst >= 0
    );
  }));
}

export function createCompetitionRules(config: CompetitionRulesConfig): CompetitionRules {
  if (!config.version.trim()) throw new Error("Competition rules require a version");
  if (config.pointsForWin < 0 || config.pointsForDraw < 0 || config.pointsForLoss < 0) {
    throw new Error("Competition rule points must not be negative");
  }
  if (config.tiebreakers.length !== new Set(config.tiebreakers).size) {
    throw new Error("Competition tiebreakers must be unique");
  }

  const requiresHeadToHead = config.tiebreakers.includes("headToHead");
  const compareTeams = (a: SimulatedStanding, b: SimulatedStanding): number => {
    if (a.points !== b.points) return compareNumbersDescending(a.points, b.points);
    for (const tiebreaker of config.tiebreakers) {
      const comparison = tiebreaker === "goalDifference"
        ? compareNumbersDescending(a.goalDifference, b.goalDifference)
        : tiebreaker === "goalsFor"
          ? compareNumbersDescending(a.goalsFor, b.goalsFor)
          : compareHeadToHead(a, b);
      if (comparison !== 0) return comparison;
    }
    return 0;
  };

  const rankStandings = (standings: SimulatedStanding[], random?: () => number): RankingGroup[] => {
    const sorted = [...standings].sort(compareTeams);
    const groups: RankingGroup[] = [];
    for (const standing of sorted) {
      const last = groups[groups.length - 1];
      if (last && compareTeams(last.standings[0], standing) === 0) {
        last.standings.push(standing);
        last.tied = true;
      } else {
        groups.push({ position: groups.length ? groups[groups.length - 1].position + groups[groups.length - 1].standings.length : 1, standings: [standing], tied: false });
      }
    }

    if (config.requireUniqueRanking && random) {
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex];
        if (group.standings.length > 1) {
          for (let i = group.standings.length - 1; i > 0; i--) {
            const swapIndex = Math.floor(random() * (i + 1));
            [group.standings[i], group.standings[swapIndex]] = [group.standings[swapIndex], group.standings[i]];
          }
          const resolvedGroups = group.standings.map((standing, offset) => ({
            position: group.position + offset,
            standings: [standing],
            tied: false,
          }));
          groups.splice(groupIndex, 1, ...resolvedGroups);
          groupIndex += resolvedGroups.length - 1;
        }
      }
    }
    return groups;
  };

  return {
    config: { ...config, tiebreakers: [...config.tiebreakers] },
    version: config.version,
    pointsForWin: config.pointsForWin,
    pointsForDraw: config.pointsForDraw,
    pointsForLoss: config.pointsForLoss,
    requiresHeadToHead,
    compareTeams,
    rankStandings,
    isChampionClinched(leader, competitors, remainingFixtures, remainingFixtureCounts) {
      for (const competitor of competitors) {
        const remaining = remainingFixtureCounts?.[competitor.teamId] ?? remainingFixtures.filter(
          (fixture) => fixture.homeTeam === competitor.teamId || fixture.awayTeam === competitor.teamId
        ).length;
        const maximumPoints = competitor.points + remaining * config.pointsForWin;
        if (leader.points < maximumPoints) return false;
        if (leader.points === maximumPoints) {
          // Future goals and results can still change every score tiebreaker while
          // the competitor has a fixture left. A known tie at the end is resolved
          // only when the configured rules already produce a strict ordering.
          if (remaining > 0 || compareTeams(leader, competitor) >= 0) return false;
        }
      }
      return true;
    },
    validate(teams, headToHead) {
      const ids = new Set(teams.map((team) => team.id));
      if (ids.size !== teams.length) throw new Error("Competition teams must have unique ids");
      if (requiresHeadToHead && !hasCompleteHeadToHead(teams, headToHead)) {
        throw new Error("Complete head-to-head data is required by the competition rules");
      }
    },
  };
}

export const eredivisieRules = createCompetitionRules({
  version: "eredivisie-rules-v1",
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakers: ["goalDifference", "goalsFor"],
});
