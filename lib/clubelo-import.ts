import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClubEloMapping } from "./clubelo-mapping";

export type { ClubEloMapping } from "./clubelo-mapping";

export const CLUB_ELO_SOURCE = "clubelo" as const;
export const CLUB_ELO_SNAPSHOT_SCHEMA_VERSION = 1;

export interface TeamStrength {
  teamId: string;
  elo: number;
  source: typeof CLUB_ELO_SOURCE;
  measuredAt: Date;
}

export interface ClubEloHistoricalRatingDto {
  date: string;
  elo: number;
  golo?: number;
}

export interface ClubEloPredictionDto {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
}

/**
 * Provider data is deliberately kept in this adapter module. The rest of the
 * prediction pipeline consumes TeamStrength and ClubEloSnapshot only.
 */
export interface ClubEloClubPageDto {
  slug: string;
  name: string;
  rating: number;
  ratingDate: string;
  historicalRatings: readonly ClubEloHistoricalRatingDto[];
  futurePredictions: readonly ClubEloPredictionDto[];
}

export interface ClubEloSnapshot {
  schemaVersion: typeof CLUB_ELO_SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  snapshotHash: string;
  competitionId: string;
  season: string;
  runRound: number;
  sourceRound: number;
  fetchedAt: string;
  freshness: "current" | "fallback";
  reused: boolean;
  strengths: readonly TeamStrength[];
}

export interface ClubEloClubPageRequest {
  execute(): Promise<ClubEloClubPageDto>;
}

export type ClubEloRequestFactory = (slug: string) => ClubEloClubPageRequest;

export interface ClubEloHttpClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class ClubEloTemporaryError extends Error {
  readonly transient = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClubEloTemporaryError";
  }
}

export class ClubEloParseError extends Error {
  readonly transient = false;

  constructor(message: string) {
    super(message);
    this.name = "ClubEloParseError";
  }
}

export class ClubEloIncompleteDataError extends Error {
  readonly transient = false;

  constructor(message: string) {
    super(message);
    this.name = "ClubEloIncompleteDataError";
  }
}

export class ClubEloRequestError extends Error {
  readonly transient: boolean;
  readonly status?: number;

  constructor(message: string, options: { transient: boolean; status?: number; cause?: unknown }) {
    super(message, options);
    this.name = "ClubEloRequestError";
    this.transient = options.transient;
    this.status = options.status;
  }
}

const DEFAULT_BASE_URL = "https://clubelo.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function validateSlug(slug: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    throw new Error(`invalid ClubElo slug: ${slug}`);
  }
  return slug;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstMatch(value: string, pattern: RegExp, description: string): string {
  const match = value.match(pattern);
  if (!match?.[1]) throw new ClubEloParseError(`ClubElo page is missing ${description}`);
  return decodeHtml(match[1].trim());
}

function parseNumber(value: string, description: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new ClubEloParseError(`ClubElo page has invalid ${description}`);
  return parsed;
}

function parseIsoDate(value: string, description: string): string {
  const utcValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value.includes("T") && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? `${value}Z` : value;
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) throw new ClubEloParseError(`ClubElo page has invalid ${description}`);
  return date.toISOString();
}

function parseHistoricalRatings(html: string): ClubEloHistoricalRatingDto[] {
  const ratings: ClubEloHistoricalRatingDto[] = [];
  const pattern = /["']Date["']\s*:\s*["']([^"']+)["']\s*,\s*["']Elo["']\s*:\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*["']Golo["']\s*:\s*(-?\d+(?:\.\d+)?))?/g;
  for (const match of html.matchAll(pattern)) {
    ratings.push({
      date: parseIsoDate(match[1], "historical rating date"),
      elo: parseNumber(match[2], "historical Elo"),
      ...(match[3] ? { golo: parseNumber(match[3], "historical Golo") } : {}),
    });
  }
  return ratings;
}

function parseProbability(value: string): number | undefined {
  const parsed = Number(value.replace(",", ".").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed / 100 : undefined;
}

function parseFuturePredictions(html: string): ClubEloPredictionDto[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const predictions: ClubEloPredictionDto[] = [];

  for (let index = 0; index < rows.length - 1; index += 1) {
    const firstRow = rows[index];
    const dateMatch = firstRow.match(/data-utc-time=["']([^"']+)["']/i);
    if (!dateMatch) continue;

    const secondRow = rows[index + 1];
    const secondDateMatch = secondRow.match(/data-utc-time=["']([^"']+)["']/i);
    if (secondDateMatch && secondDateMatch[1] !== dateMatch[1]) continue;

    const links = (row: string): string[] =>
      [...row.matchAll(/href=["']\/([^"'#?]+)["']/gi)]
        .map((match) => decodeHtml(match[1]));
    const firstLinks = links(firstRow);
    const secondLinks = links(secondRow);
    const homeTeam = firstLinks.at(-1);
    const awayTeam = secondLinks.at(-1);
    if (!homeTeam || !awayTeam) continue;

    const firstPercentages = [...firstRow.matchAll(/<span\b[^>]*class=["'][^"']*min1081[^"']*["'][^>]*>(\d+(?:\.\d+)?)<\/span>/gi)]
      .map((match) => parseProbability(match[1]));
    const secondPercentages = [...secondRow.matchAll(/<span\b[^>]*class=["'][^"']*min1081[^"']*["'][^>]*>(\d+(?:\.\d+)?)<\/span>/gi)]
      .map((match) => parseProbability(match[1]));
    const homeProbability = firstPercentages[0];
    const drawProbability = firstPercentages[1];
    const awayProbability = secondPercentages[0];

    if (homeProbability === undefined || drawProbability === undefined || awayProbability === undefined) continue;
    if (Math.abs(homeProbability + drawProbability + awayProbability - 1) > 0.02) continue;

    predictions.push({
      date: parseIsoDate(dateMatch[1], "prediction date"),
      homeTeam,
      awayTeam,
      homeProbability,
      drawProbability,
      awayProbability,
    });
    index += 1;
  }

  return predictions;
}

export function parseClubEloClubPage(html: string, requestedSlug?: string): ClubEloClubPageDto {
  const pageSlug = firstMatch(html, /<h1[^>]*>\s*<a[^>]*href=["']\/[^"']+\/([^"']+)["'][^>]*>/i, "club slug");
  const slug = requestedSlug ? validateSlug(requestedSlug) : pageSlug;
  if (requestedSlug && pageSlug.toLowerCase() !== slug.toLowerCase()) {
    throw new ClubEloParseError(`ClubElo page slug ${pageSlug} does not match requested slug ${slug}`);
  }
  const name = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i, "club name");
  const rating = parseNumber(firstMatch(html, /Elo\s*:\s*<b[^>]*>([\d.,]+)<\/b>/i, "current Elo"), "current Elo");
  const ratingDate = parseIsoDate(firstMatch(html, /<h1[^>]*>\s*<a[^>]*href=["']\/(\d{4}-\d{2}-\d{2})\//i, "rating date"), "rating date");

  const cleanedName = stripTags(name);
  if (!cleanedName) throw new ClubEloParseError("ClubElo page has an empty club name");

  return {
    slug,
    name: cleanedName,
    rating,
    ratingDate,
    historicalRatings: parseHistoricalRatings(html),
    futurePredictions: parseFuturePredictions(html),
  };
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class ClubEloClubPageRequestImpl implements ClubEloClubPageRequest {
  readonly slug: string;
  readonly url: string;
  private readonly options: Required<Pick<ClubEloHttpClientOptions, "fetch" | "timeoutMs" | "maxRetries" | "retryDelayMs" | "sleep">>;

  constructor(slug: string, options: ClubEloHttpClientOptions = {}) {
    this.slug = validateSlug(slug);
    this.url = `${normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)}/${this.slug}`;
    this.options = {
      fetch: options.fetch ?? fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      sleep: options.sleep ?? defaultSleep,
    };
  }

  async execute(): Promise<ClubEloClubPageDto> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout();
        if (!response.ok) {
          throw new ClubEloRequestError(`ClubElo request failed with HTTP ${response.status}`, {
            transient: isTransientStatus(response.status),
            status: response.status,
          });
        }
        const html = await response.text();
        return parseClubEloClubPage(html, this.slug);
      } catch (error) {
        lastError = error;
        if (!(error instanceof ClubEloRequestError ? error.transient : error instanceof ClubEloTemporaryError)) throw error;
        if (attempt === this.options.maxRetries) break;
        await this.options.sleep(this.options.retryDelayMs * 2 ** attempt);
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ClubEloTemporaryError(`ClubElo request failed for ${this.slug}`);
  }

  private async fetchWithTimeout(): Promise<Response> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Response>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new ClubEloTemporaryError(`ClubElo request timed out for ${this.slug}`));
      }, this.options.timeoutMs);
    });
    try {
      return await Promise.race([
        this.options.fetch(this.url, { signal: controller.signal }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof ClubEloTemporaryError) throw error;
      if (controller.signal.aborted) {
        throw new ClubEloTemporaryError(`ClubElo request timed out for ${this.slug}`, { cause: error });
      }
      throw new ClubEloTemporaryError(`ClubElo request failed for ${this.slug}`, { cause: error });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}

export { ClubEloClubPageRequestImpl as ClubEloClubPageRequestClass };

interface QueuedRequest {
  slug: string;
  resolve: (value: ClubEloClubPageDto) => void;
  reject: (reason?: unknown) => void;
}

export interface ClubEloRunCacheOptions {
  maxConcurrency?: number;
}

/** A cache belongs to one prediction run and caches in-flight work as well. */
export class ClubEloRunCache {
  private readonly requests = new Map<string, Promise<ClubEloClubPageDto>>();
  private readonly queue: QueuedRequest[] = [];
  private active = 0;
  private readonly maxConcurrency: number;

  constructor(private readonly requestFactory: ClubEloRequestFactory, options: ClubEloRunCacheOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 3;
    if (!Number.isInteger(this.maxConcurrency) || this.maxConcurrency < 1) {
      throw new Error("ClubElo cache concurrency must be a positive integer");
    }
  }

  get(slug: string): Promise<ClubEloClubPageDto> {
    const validSlug = validateSlug(slug);
    const cached = this.requests.get(validSlug);
    if (cached) return cached;

    const promise = new Promise<ClubEloClubPageDto>((resolve, reject) => {
      this.queue.push({ slug: validSlug, resolve, reject });
      this.drain();
    });
    this.requests.set(validSlug, promise);
    return promise;
  }

  private drain(): void {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const request = this.queue.shift()!;
      this.active += 1;
      void Promise.resolve()
        .then(() => this.requestFactory(request.slug).execute())
        .then(request.resolve, request.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

export interface ClubEloSnapshotStore {
  load(competitionId: string, season: string, sourceRound: number): Promise<ClubEloSnapshot | null>;
  saveAtomic(snapshot: ClubEloSnapshot): Promise<void>;
}

export class FileClubEloSnapshotStore implements ClubEloSnapshotStore {
  constructor(private readonly directory: string) {}

  async load(competitionId: string, season: string, sourceRound: number): Promise<ClubEloSnapshot | null> {
    const path = this.pathFor(competitionId, season, sourceRound);
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as ClubEloSnapshot;
      return freezeSnapshot({
        ...value,
        strengths: value.strengths.map((strength) => ({
          ...strength,
          measuredAt: toDate(String(strength.measuredAt)),
        })),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async saveAtomic(snapshot: ClubEloSnapshot): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const path = this.pathFor(snapshot.competitionId, snapshot.season, snapshot.sourceRound);
    const temporaryPath = `${path}.${snapshot.snapshotHash}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  }

  private pathFor(competitionId: string, season: string, sourceRound: number): string {
    const safeCompetition = competitionId.replace(/[^A-Za-z0-9_-]/g, "_");
    const safeSeason = season.replace(/[^A-Za-z0-9_-]/g, "_");
    return join(this.directory, `${safeCompetition}-${safeSeason}-round-${sourceRound}.json`);
  }
}

export interface ClubEloSnapshotImportInput {
  competitionId: string;
  season: string;
  runRound: number;
  mappings: readonly ClubEloMapping[];
}

export interface ClubEloSnapshotImporterOptions {
  store: ClubEloSnapshotStore;
  requestFactory: ClubEloRequestFactory;
  now?: () => Date;
  maxConcurrency?: number;
}

function assertImportInput(input: ClubEloSnapshotImportInput): ClubEloMapping[] {
  if (!Number.isInteger(input.runRound) || input.runRound < 0) throw new Error("ClubElo run round must be a non-negative integer");
  if (input.mappings.length === 0) throw new ClubEloIncompleteDataError("ClubElo snapshot has no required clubs");

  const seenSourceIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const mappings = [...input.mappings];
  for (const mapping of mappings) {
    if (mapping.scope.competitionId !== input.competitionId || mapping.scope.season !== input.season || mapping.scope.kind !== "current") {
      throw new Error(`ClubElo mapping scope does not match ${input.competitionId}/${input.season}`);
    }
    if (mapping.status !== "approved" || !mapping.clubEloSlug) {
      throw new ClubEloIncompleteDataError(`ClubElo mapping for ${mapping.sourceId} is not approved`);
    }
    const slug = validateSlug(mapping.clubEloSlug);
    if (seenSourceIds.has(mapping.sourceId)) throw new Error(`duplicate ClubElo source mapping: ${mapping.sourceId}`);
    if (seenSlugs.has(slug)) throw new Error(`duplicate ClubElo slug mapping: ${slug}`);
    seenSourceIds.add(mapping.sourceId);
    seenSlugs.add(slug);
  }
  return mappings.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

function canonicalSnapshotValue(snapshot: Pick<ClubEloSnapshot, "competitionId" | "season" | "sourceRound" | "fetchedAt" | "strengths">): string {
  return JSON.stringify({
    competitionId: snapshot.competitionId,
    season: snapshot.season,
    sourceRound: snapshot.sourceRound,
    fetchedAt: snapshot.fetchedAt,
    strengths: [...snapshot.strengths].map((strength) => ({
      ...strength,
      measuredAt: strength.measuredAt.toISOString(),
    })).sort((a, b) => a.teamId.localeCompare(b.teamId)),
  });
}

function snapshotHash(snapshot: Pick<ClubEloSnapshot, "competitionId" | "season" | "sourceRound" | "fetchedAt" | "strengths">): string {
  return createHash("sha256").update(canonicalSnapshotValue(snapshot)).digest("hex");
}

export function calculateClubEloSnapshotHash(
  snapshot: Pick<ClubEloSnapshot, "competitionId" | "season" | "sourceRound" | "fetchedAt" | "strengths">,
): string {
  return snapshotHash(snapshot);
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ClubEloIncompleteDataError("ClubElo rating has an invalid date");
  return new Date(date.getTime());
}

function isCompleteFallback(snapshot: ClubEloSnapshot, input: ClubEloSnapshotImportInput, mappings: readonly ClubEloMapping[]): boolean {
  if (snapshot.schemaVersion !== CLUB_ELO_SNAPSHOT_SCHEMA_VERSION) return false;
  if (snapshot.competitionId !== input.competitionId || snapshot.season !== input.season) return false;
  if (snapshot.sourceRound < input.runRound - 1 || snapshot.sourceRound > input.runRound) return false;
  const expected = new Set(mappings.map((mapping) => mapping.sourceId));
  const actual = new Set(snapshot.strengths.map((strength) => strength.teamId));
  return expected.size === actual.size && [...expected].every((teamId) => actual.has(teamId)) && snapshot.strengths.every((strength) => Number.isFinite(strength.elo));
}

export class ClubEloSnapshotImporter {
  private runPromise?: Promise<ClubEloSnapshot>;
  private runKey?: string;

  constructor(private readonly options: ClubEloSnapshotImporterOptions) {}

  import(input: ClubEloSnapshotImportInput): Promise<ClubEloSnapshot> {
    const key = `${input.competitionId}:${input.season}:${input.runRound}`;
    if (this.runPromise) {
      if (this.runKey !== key) return Promise.reject(new Error("one ClubElo importer cannot combine different runs"));
      return this.runPromise;
    }
    this.runKey = key;
    this.runPromise = this.importOnce(input);
    return this.runPromise;
  }

  private async importOnce(input: ClubEloSnapshotImportInput): Promise<ClubEloSnapshot> {
    const mappings = assertImportInput(input);
    const cache = new ClubEloRunCache(this.options.requestFactory, { maxConcurrency: this.options.maxConcurrency });

    try {
      const pages = await Promise.all(mappings.map((mapping) => cache.get(mapping.clubEloSlug!)));
      const fetchedAt = (this.options.now ?? (() => new Date()))().toISOString();
      const strengths = mappings.map((mapping, index) => {
        const page = pages[index];
        if (page.slug !== mapping.clubEloSlug || !Number.isFinite(page.rating)) {
          throw new ClubEloIncompleteDataError(`ClubElo page does not contain a valid rating for ${mapping.sourceId}`);
        }
        return {
          teamId: mapping.sourceId,
          elo: page.rating,
          source: CLUB_ELO_SOURCE,
          measuredAt: toDate(page.ratingDate),
        } satisfies TeamStrength;
      });
      const content = { competitionId: input.competitionId, season: input.season, sourceRound: input.runRound, fetchedAt, strengths };
      const hash = snapshotHash(content);
      const snapshot: ClubEloSnapshot = {
        ...content,
        schemaVersion: CLUB_ELO_SNAPSHOT_SCHEMA_VERSION,
        snapshotId: `clubelo-${hash.slice(0, 16)}`,
        snapshotHash: hash,
        runRound: input.runRound,
        freshness: "current",
        reused: false,
      };
      await this.options.store.saveAtomic(snapshot);
      return freezeSnapshot(snapshot);
    } catch (error) {
      if (!(error instanceof ClubEloTemporaryError || (error instanceof ClubEloRequestError && error.transient))) throw error;
      const fallback = await this.findFallback(input, mappings);
      if (!fallback) throw error;
      return freezeSnapshot({ ...fallback, runRound: input.runRound, freshness: "fallback", reused: true });
    }
  }

  private async findFallback(input: ClubEloSnapshotImportInput, mappings: readonly ClubEloMapping[]): Promise<ClubEloSnapshot | null> {
    for (const sourceRound of [input.runRound, input.runRound - 1]) {
      if (sourceRound < 0) continue;
      const snapshot = await this.options.store.load(input.competitionId, input.season, sourceRound);
      if (snapshot?.sourceRound === sourceRound && isCompleteFallback(snapshot, input, mappings)) return snapshot;
    }
    return null;
  }
}

function freezeSnapshot(snapshot: ClubEloSnapshot): ClubEloSnapshot {
  for (const strength of snapshot.strengths) Object.freeze(strength);
  Object.freeze(snapshot.strengths);
  return Object.freeze(snapshot);
}

export { ClubEloSnapshotImporter as ClubEloImporter };
