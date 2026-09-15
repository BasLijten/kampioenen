/**
 * npm run fetch-data
 *
 * Haalt live data op voor de geconfigureerde league en slaat het op.
 * Vereist:
 * - TARGET_LEAGUE env var
 * - FOOTBALL_DATA_ORG_KEY (standings + matches)
 * Optioneel:
 *
 * Bronnen:
 * - football-data.org: standings + scheduled matches
 * - ClubElo: current team-strength snapshot, loaded from approved mappings
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fetchFootballDataOrgStandings, fetchFootballDataOrgMatches } from "../lib/football-data-org";
import { transformStandings, transformFixtures, toTeamId } from "../lib/transform";
import { resolveLeague } from "../config/env";
import { FileClubEloSnapshotStore, ClubEloClubPageRequestImpl, ClubEloSnapshotImporter } from "../lib/clubelo-import";
import type { ClubEloMappingDocument } from "../lib/clubelo-mapping";
import { createCompetitionSnapshotIds } from "../lib/competition-snapshots";

// Laad .env.local handmatig (tsx heeft geen Next.js env-loading)
function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.replace(/\r$/, "");
      const match = trimmed.match(/^([A-Z0-9_]+)=(.+)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // .env.local bestaat niet -- vereiste variabelen moeten al in de omgeving staan
  }
}

async function main() {
  loadEnv();

  const league = resolveLeague();
  console.log(`League: ${league.name} (${league.id})`);

  if (!process.env.FOOTBALL_DATA_ORG_KEY || process.env.FOOTBALL_DATA_ORG_KEY === "your_api_key_here") {
    console.error("Zet FOOTBALL_DATA_ORG_KEY in .env.local");
    process.exit(1);
  }
  console.log(`Standings + matches ophalen van football-data.org (${league.footballDataOrgCode})...`);
  const [standings, rawFixtures] = await Promise.all([
    fetchFootballDataOrgStandings(league.footballDataOrgCode),
    fetchFootballDataOrgMatches(league.footballDataOrgCode),
  ]);
  if (standings.length === 0) {
    throw new Error("Geen standings ontvangen van football-data.org; bestaand databestand blijft ongewijzigd.");
  }
  console.log(`   ${standings.length} teams, ${rawFixtures.length} resterende wedstrijden`);

  const teams = transformStandings(standings);
  const teamIds = new Set(teams.map((team) => team.id));
  const missingTeamIds = new Set<string>();
  rawFixtures.forEach((fixture) => {
    const homeId = toTeamId(fixture.teams.home.name);
    const awayId = toTeamId(fixture.teams.away.name);
    if (!teamIds.has(homeId)) missingTeamIds.add(homeId);
    if (!teamIds.has(awayId)) missingTeamIds.add(awayId);
  });
  if (missingTeamIds.size > 0) {
    throw new Error(
      `Standings missen teams voor fixtures: ${Array.from(missingTeamIds).sort().join(", ")}`
    );
  }

  const remainingFixtures = transformFixtures(rawFixtures, new Map(), teams);
  const fetchedAt = new Date().toISOString();
  const snapshotIds = createCompetitionSnapshotIds(teams, remainingFixtures);
  const mappingPath = join(process.cwd(), league.dataDir, league.prediction.mappingFile);
  const mappingDocument = JSON.parse(readFileSync(mappingPath, "utf8")) as ClubEloMappingDocument;
  const runRound = Math.max(...teams.map((team) => team.played));
  const snapshotStore = new FileClubEloSnapshotStore(join(process.cwd(), league.dataDir, league.prediction.snapshotDirectory));
  const importer = new ClubEloSnapshotImporter({
    store: snapshotStore,
    requestFactory: (slug) => new ClubEloClubPageRequestImpl(slug),
  });
  const snapshot = await importer.import({ competitionId: league.id, season: league.season, runRound, mappings: mappingDocument.mappings });
  console.log(`   ClubElo snapshot: ${snapshot.snapshotId} (${snapshot.freshness})`);

  const dataDir = join(process.cwd(), league.dataDir);
  mkdirSync(dataDir, { recursive: true });
  const output = {
    teams,
    remainingFixtures,
    fetchedAt,
    ...snapshotIds,
    clubEloSnapshotId: snapshot.snapshotId,
  };
  writeFileSync(
    join(dataDir, "standings.json"),
    JSON.stringify(output, null, 2)
  );
  console.log(`${league.dataDir}/standings.json opgeslagen`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
