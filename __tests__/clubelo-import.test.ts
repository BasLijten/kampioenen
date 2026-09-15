import { describe, expect, it, vi } from "vitest";
import {
  ClubEloClubPageRequestImpl,
  ClubEloIncompleteDataError,
  ClubEloParseError,
  ClubEloRunCache,
  ClubEloSnapshotImporter,
  ClubEloTemporaryError,
  parseClubEloClubPage,
  type ClubEloClubPageDto,
  type ClubEloMapping,
  type ClubEloSnapshot,
  type ClubEloSnapshotStore,
} from "../lib/clubelo-import";
import type { MappingScope } from "../lib/clubelo-mapping";

const scope: MappingScope = { competitionId: "eredivisie", season: "2026/27", kind: "current" };

const pageHtml = `
  <h1><a href="/2026-09-14/PSV">PSV</a></h1>
  <p>Elo: <b>1791</b></p>
  <table>
    <tr><td data-utc-time="2026-09-20T12:30Z"></td><td><a href="/NED">NED</a><a href="/Twente">Twente</a></td>
      <td><span class="min1081">24.4</span><span class="min1081">25.8</span></td></tr>
    <tr><td><a href="/NED">NED</a><a href="/PSV">PSV</a></td><td><span class="min1081">49.8</span></td></tr>
  </table>
  <script>const data = [{"Date":"2026-09-12T00:00:00","Elo":1780.5,"Golo":1.9}];</script>
`;

const pages: Record<string, ClubEloClubPageDto> = {
  psv: { slug: "psv", name: "PSV", rating: 1791, ratingDate: "2026-09-14T00:00:00.000Z", historicalRatings: [], futurePredictions: [] },
  ajax: { slug: "ajax", name: "Ajax", rating: 1802, ratingDate: "2026-09-14T00:00:00.000Z", historicalRatings: [], futurePredictions: [] },
};

function mapping(sourceId: string, slug: string): ClubEloMapping {
  return {
    sourceId,
    sourceName: sourceId,
    clubEloSlug: slug,
    scope,
    confidence: 1,
    matchMethod: "manual",
    status: "approved",
    locked: true,
    candidates: [],
    generatorVersion: "clubelo-mapping-v1",
    generatedAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    approvedAt: "2026-09-14T00:00:00.000Z",
    approvedBy: "test",
  };
}

class MemoryStore implements ClubEloSnapshotStore {
  readonly saved: ClubEloSnapshot[] = [];
  constructor(private readonly snapshots = new Map<string, ClubEloSnapshot>()) {}

  async load(_competitionId: string, _season: string, sourceRound: number): Promise<ClubEloSnapshot | null> {
    return this.snapshots.get(String(sourceRound)) ?? null;
  }

  async saveAtomic(snapshot: ClubEloSnapshot): Promise<void> {
    this.saved.push(snapshot);
    this.snapshots.set(String(snapshot.sourceRound), snapshot);
  }
}

function snapshot(sourceRound: number, strengths = [
  { teamId: "psv-id", elo: 1791, source: "clubelo" as const, measuredAt: new Date("2026-09-13T00:00:00.000Z") },
  { teamId: "ajax-id", elo: 1802, source: "clubelo" as const, measuredAt: new Date("2026-09-13T00:00:00.000Z") },
]): ClubEloSnapshot {
  return {
    schemaVersion: 1,
    snapshotId: `snapshot-${sourceRound}`,
    snapshotHash: `hash-${sourceRound}`,
    competitionId: "eredivisie",
    season: "2026/27",
    runRound: sourceRound,
    sourceRound,
    fetchedAt: "2026-09-13T12:00:00.000Z",
    freshness: "current",
    reused: false,
    strengths,
  };
}

describe("ClubElo page adapter", () => {
  it("parses current rating context, historical rows and future 1/X/2 predictions", () => {
    const parsed = parseClubEloClubPage(pageHtml);

    expect(parsed).toMatchObject({ slug: "PSV", name: "PSV", rating: 1791, ratingDate: "2026-09-14T00:00:00.000Z" });
    expect(parsed.historicalRatings).toEqual([{ date: "2026-09-12T00:00:00.000Z", elo: 1780.5, golo: 1.9 }]);
    expect(parsed.futurePredictions).toEqual([{
      date: "2026-09-20T12:30:00.000Z",
      homeTeam: "Twente",
      awayTeam: "PSV",
      homeProbability: 0.244,
      drawProbability: 0.258,
      awayProbability: 0.498,
    }]);
  });

  it("fails closed on structural parse errors", () => {
    expect(() => parseClubEloClubPage("<h1>PSV</h1>")).toThrow(ClubEloParseError);
  });

  it("retries transient HTTP failures with bounded exponential delays", async () => {
    const statuses = [503, 429, 200];
    const delays: number[] = [];
    const request = new ClubEloClubPageRequestImpl("psv", {
      fetch: vi.fn(async () => {
        const status = statuses.shift()!;
        return new Response(status === 200 ? pageHtml : "", { status });
      }),
      maxRetries: 2,
      retryDelayMs: 5,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });

    await expect(request.execute()).resolves.toMatchObject({ rating: 1791 });
    expect(delays).toEqual([5, 10]);
  });

  it("retries and then reports a timeout as temporary", async () => {
    const request = new ClubEloClubPageRequestImpl("psv", {
      fetch: () => new Promise<Response>(() => undefined),
      timeoutMs: 5,
      maxRetries: 1,
      sleep: async () => undefined,
    });

    await expect(request.execute()).rejects.toBeInstanceOf(ClubEloTemporaryError);
  });
});

describe("ClubElo run cache", () => {
  it("deduplicates in-flight requests and respects the concurrency bound", async () => {
    let active = 0;
    let maximum = 0;
    const calls: string[] = [];
    const cache = new ClubEloRunCache((slug) => ({
      execute: async () => {
        calls.push(slug);
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return pages[slug];
      },
    }), { maxConcurrency: 2 });

    const first = cache.get("psv");
    const second = cache.get("psv");
    await Promise.all([first, second, cache.get("ajax"), cache.get("psv")]);

    expect(first).toBe(second);
    expect(calls).toEqual(["psv", "ajax"]);
    expect(maximum).toBe(2);
  });
});

describe("ClubElo complete snapshot importer", () => {
  it("stores one complete immutable snapshot and maps provider data to team strengths", async () => {
    const store = new MemoryStore();
    const importer = new ClubEloSnapshotImporter({
      store,
      requestFactory: (slug) => ({ execute: async () => pages[slug] }),
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      maxConcurrency: 2,
    });

    const result = await importer.import({
      competitionId: "eredivisie",
      season: "2026/27",
      runRound: 5,
      mappings: [mapping("psv-id", "psv"), mapping("ajax-id", "ajax")],
    });

    expect(store.saved).toHaveLength(1);
    expect(result).toMatchObject({ sourceRound: 5, runRound: 5, freshness: "current", reused: false, snapshotId: expect.stringMatching(/^clubelo-/) });
    expect(result.strengths.map(({ teamId, elo }) => ({ teamId, elo }))).toEqual([
      { teamId: "ajax-id", elo: 1802 },
      { teamId: "psv-id", elo: 1791 },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.strengths)).toBe(true);
  });

  it("rejects incomplete current data instead of silently using an older snapshot", async () => {
    const store = new MemoryStore(new Map([["4", snapshot(4)]]));
    const importer = new ClubEloSnapshotImporter({
      store,
      requestFactory: () => ({ execute: async () => ({ ...pages.psv, rating: Number.NaN }) }),
    });

    await expect(importer.import({
      competitionId: "eredivisie", season: "2026/27", runRound: 5,
      mappings: [mapping("psv-id", "psv"), mapping("ajax-id", "ajax")],
    })).rejects.toBeInstanceOf(ClubEloIncompleteDataError);
  });

  it("reuses only a complete snapshot from the current or immediately previous round after a temporary failure", async () => {
    const previous = snapshot(4);
    const store = new MemoryStore(new Map([["4", previous]]));
    const importer = new ClubEloSnapshotImporter({
      store,
      requestFactory: () => ({ execute: async () => { throw new ClubEloTemporaryError("temporary"); } }),
    });

    const result = await importer.import({
      competitionId: "eredivisie", season: "2026/27", runRound: 5,
      mappings: [mapping("psv-id", "psv"), mapping("ajax-id", "ajax")],
    });

    expect(result).toMatchObject({ snapshotId: previous.snapshotId, sourceRound: 4, runRound: 5, freshness: "fallback", reused: true });
    expect(store.saved).toEqual([]);
  });

  it("rejects a snapshot that is two or more rounds old regardless of its timestamp", async () => {
    const store = new MemoryStore(new Map([["3", snapshot(3)]]));
    const importer = new ClubEloSnapshotImporter({
      store,
      requestFactory: () => ({ execute: async () => { throw new ClubEloTemporaryError("temporary"); } }),
    });

    await expect(importer.import({
      competitionId: "eredivisie", season: "2026/27", runRound: 5,
      mappings: [mapping("psv-id", "psv"), mapping("ajax-id", "ajax")],
    })).rejects.toBeInstanceOf(ClubEloTemporaryError);
  });

  it("never combines clubs from different snapshots", async () => {
    const store = new MemoryStore(new Map([["4", snapshot(4, [snapshot(4).strengths[0]])]]));
    const importer = new ClubEloSnapshotImporter({
      store,
      requestFactory: () => ({ execute: async () => { throw new ClubEloTemporaryError("temporary"); } }),
    });

    await expect(importer.import({
      competitionId: "eredivisie", season: "2026/27", runRound: 5,
      mappings: [mapping("psv-id", "psv"), mapping("ajax-id", "ajax")],
    })).rejects.toBeInstanceOf(ClubEloTemporaryError);
  });
});
