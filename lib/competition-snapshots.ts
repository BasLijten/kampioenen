import { createHash } from "node:crypto";
import type { Fixture, Team } from "./data";

export interface CompetitionSnapshotIds {
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
}

function snapshotId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}

export function createCompetitionSnapshotIds(teams: readonly Team[], fixtures: readonly Fixture[]): CompetitionSnapshotIds {
  return {
    standingsSnapshotId: snapshotId("standings", teams),
    fixturesSnapshotId: snapshotId("fixtures", fixtures.map(({ id, date, round, homeTeam, awayTeam }) => ({ id, date, round, homeTeam, awayTeam }))),
  };
}
