/**
 * npm run simulate
 *
 * Leest data/{league}/standings.json, voert de Monte Carlo simulatie uit
 * (100.000 seeded iteraties) en slaat het resultaat op als data/{league}/simulation-results.json.
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { CLUB_ELO_PRODUCTION_MODEL_VERSION, runClubEloPrediction } from "../lib/production-prediction";
import { createCompetitionRules } from "../lib/competition-rules";
import type { Team, Fixture } from "../lib/data";
import { resolveLeague } from "../config/env";
import { FileClubEloSnapshotStore } from "../lib/clubelo-import";
import { createCompetitionSnapshotIds } from "../lib/competition-snapshots";
import type { ClubEloMappingDocument } from "../lib/clubelo-mapping";
import type { CalibrationArtifactSet } from "../lib/clubelo-calibration";

// Laad .env.local handmatig (tsx heeft geen Next.js env-loading)
function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.replace(/\r$/, "");
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env.local bestaat niet
  }
}

loadEnv();

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("SIMULATION_ITERATIONS must be a positive integer");
  return parsed;
}

function integerSeed(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("SIMULATION_SEED must be an integer");
  return parsed;
}

function loadLeagueData(dataDir: string): { teams: Team[]; fixtures: Fixture[]; fetchedAt: string | null; standingsSnapshotId?: string; fixturesSnapshotId?: string } {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), dataDir, "standings.json"), "utf-8");
  } catch {
    throw new Error(`${dataDir}/standings.json ontbreekt; voer eerst npm run fetch-data uit`);
  }
  const parsed = JSON.parse(raw);
  return {
    teams: parsed.teams as Team[],
    fixtures: parsed.remainingFixtures as Fixture[],
    fetchedAt: parsed.fetchedAt ?? null,
    standingsSnapshotId: parsed.standingsSnapshotId,
    fixturesSnapshotId: parsed.fixturesSnapshotId,
  };
}

async function main() {
  const league = resolveLeague();
  if (league.prediction.modelVersion !== CLUB_ELO_PRODUCTION_MODEL_VERSION) {
    throw new Error(`Unsupported production prediction model ${league.prediction.modelVersion}`);
  }
  const { teams, fixtures, fetchedAt, standingsSnapshotId, fixturesSnapshotId } = loadLeagueData(league.dataDir);
  const dataDir = join(process.cwd(), league.dataDir);
  const snapshotIds = createCompetitionSnapshotIds(teams, fixtures);
  const mapping = JSON.parse(readFileSync(join(dataDir, league.prediction.mappingFile), "utf8")) as ClubEloMappingDocument;
  const calibration = JSON.parse(readFileSync(join(dataDir, league.prediction.calibrationFile), "utf8")) as CalibrationArtifactSet;
  const runRound = Math.max(...teams.map((team) => team.played));
  const snapshotStore = new FileClubEloSnapshotStore(join(dataDir, league.prediction.snapshotDirectory));
  const snapshot = await snapshotStore.load(league.id, league.season, runRound);
  if (!snapshot) throw new Error(`ClubElo snapshot ontbreekt voor ${league.id}/${league.season}/round-${runRound}`);
  const iterations = positiveInteger(process.env.SIMULATION_ITERATIONS, league.prediction.iterations);
  const seed = integerSeed(process.env.SIMULATION_SEED, league.prediction.seed);

  console.log(`League: ${league.name} (${league.id})`);
  console.log(`Monte Carlo simulatie (${iterations.toLocaleString()} iteraties, seed ${seed})...`);
  console.log(`   ${teams.length} teams, ${fixtures.length} resterende wedstrijden`);
  if (fetchedAt) {
    console.log(`   Data van: ${new Date(fetchedAt).toLocaleString(league.locale)}`);
  }

  const start = Date.now();
  const result = runClubEloPrediction({
    teams,
    fixtures,
    totalRounds: league.totalRounds,
    iterations,
    seed,
    competition: league.id,
    season: league.season,
    standingsSnapshotId: standingsSnapshotId ?? snapshotIds.standingsSnapshotId,
    fixturesSnapshotId: fixturesSnapshotId ?? snapshotIds.fixturesSnapshotId,
    inputs: { mapping, snapshot, calibration },
    rules: createCompetitionRules(league.competitionRules),
    homeAdvantage: league.prediction.homeAdvantage,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Show top clubs' championship probabilities
  const sorted = Object.values(result.clubResults)
    .sort((a, b) => b.totalChampionshipProbability - a.totalChampionshipProbability);

  console.log(`   Klaar in ${elapsed}s`);
  console.log("   Top clubs:");
  for (const club of sorted.slice(0, 6)) {
    if (club.totalChampionshipProbability > 0) {
      console.log(`     ${club.teamName}: ${(club.totalChampionshipProbability * 100).toFixed(1)}%`);
    }
  }

  // Build explanation per club (all clubs)
  const explanation: Record<string, object> = {};
  for (const club of sorted) {
    const team = teams.find((t) => t.id === club.teamId)!;
    const remaining = league.totalRounds - team.played;
    const rivals = teams
      .filter((t) => t.id !== club.teamId)
      .map((t) => {
        const teamFixtures = fixtures.filter(
          (f) => f.homeTeam === t.id || f.awayTeam === t.id
        );
        const winAllProb = teamFixtures.reduce((p, f) => {
          const winProb = f.homeTeam === t.id ? f.homeWinProb : f.awayWinProb;
          return p * winProb;
        }, 1);
        return {
          name: t.name,
          points: t.points,
          maxPoints: t.points + (league.totalRounds - t.played) * 3,
          gap: team.points - t.points,
          winAllProb,
        };
      })
      .sort((a, b) => b.maxPoints - a.maxPoints)
      .slice(0, 5);

    explanation[club.teamId] = {
      clubPoints: team.points,
      clubPlayed: team.played,
      clubRemaining: remaining,
      rivals,
      iterations: result.iterations,
      championCount: Math.round(club.totalChampionshipProbability * result.iterations),
      neverChampionCount: club.neverChampionCount,
    };
  }

  mkdirSync(dataDir, { recursive: true });
  const output = {
    clubResults: result.clubResults,
    iterations: result.iterations,
    seed: result.seed,
    rulesVersion: result.rulesVersion,
    fixtureOrder: result.fixtureOrder,
    seededTieBreakCount: result.seededTieBreakCount,
    explanation,
    teams,
    fixtures: result.fixtures ?? fixtures,
    fetchedAt,
    simulatedAt: new Date().toISOString(),
    metadata: result.metadata,
  };
  writeFileSync(
    join(dataDir, "simulation-results.json"),
    JSON.stringify(output, null, 2)
  );
  console.log(`${league.dataDir}/simulation-results.json opgeslagen`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
