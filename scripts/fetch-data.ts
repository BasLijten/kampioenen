/**
 * npm run fetch-data
 *
 * Haalt live Eredivisie data op via API-Football en slaat het op als
 * data/eredivisie.json. Vereist API_FOOTBALL_KEY in .env.local.
 *
 * API-Football free tier: 100 req/dag
 * - 1 req  voor standings
 * - 1 req  voor remaining fixtures
 * - N req  voor predictions (1 per fixture, best-effort)
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  fetchStandings,
  fetchRemainingFixtures,
  fetchPredictions,
  ApiPrediction,
} from "../lib/api-football";
import { transformStandings, transformFixtures } from "../lib/transform";

// Laad .env.local handmatig (tsx heeft geen Next.js env-loading)
function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (match) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // .env.local bestaat niet — API_FOOTBALL_KEY moet al in de omgeving staan
  }
}

async function main() {
  loadEnv();

  if (!process.env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY === "your_api_key_here") {
    console.error("❌  Zet API_FOOTBALL_KEY in .env.local");
    process.exit(1);
  }

  console.log("📡  Standings ophalen...");
  const [standings, rawFixtures] = await Promise.all([
    fetchStandings(),
    fetchRemainingFixtures(),
  ]);
  console.log(`   ${standings.length} teams, ${rawFixtures.length} resterende wedstrijden`);

  console.log("📡  Predictions ophalen (parallel, best-effort)...");
  const predictionMap = new Map<number, ApiPrediction>();
  const predResults = await Promise.allSettled(
    rawFixtures.map((f) => fetchPredictions(f.fixture.id))
  );
  let predCount = 0;
  predResults.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      predictionMap.set(rawFixtures[i].fixture.id, result.value);
      predCount++;
    }
  });
  console.log(`   ${predCount}/${rawFixtures.length} predictions ontvangen`);

  const teams = transformStandings(standings);
  const remainingFixtures = transformFixtures(rawFixtures, predictionMap, teams);

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const output = {
    teams,
    remainingFixtures,
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(process.cwd(), "data/eredivisie.json"),
    JSON.stringify(output, null, 2)
  );
  console.log("✅  data/eredivisie.json opgeslagen");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
