/**
 * npm run fetch-data
 *
 * Haalt live Eredivisie data op en slaat het op als data/eredivisie.json.
 * Vereist:
 * - FOOTBALL_DATA_ORG_KEY (standings + matches)
 * Optioneel:
 * - BZZOIRO_TOKEN (predictions — best-effort, Poisson fallback)
 *
 * Bronnen:
 * - football-data.org: standings + scheduled matches
 * - BZZOIRO: predictions (matched by team pair)
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  ApiPrediction,
} from "../lib/api-football";
import {
  fetchUpcomingPredictions,
  BzzPrediction,
} from "../lib/bzzoiro";
import { fetchFootballDataOrgStandings, fetchFootballDataOrgMatches } from "../lib/football-data-org";
import { transformStandings, transformFixtures, toTeamId } from "../lib/transform";

// Laad .env.local handmatig (tsx heeft geen Next.js env-loading)
function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.replace(/\r$/, "");
      const match = trimmed.match(/^([A-Z0-9_]+)=(.+)$/);
      if (match) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // .env.local bestaat niet — vereiste variabelen moeten al in de omgeving staan
  }
}

function teamPairKey(home: string, away: string): string {
  return `${toTeamId(home)}:${toTeamId(away)}`;
}

function toApiPrediction(prediction: BzzPrediction): ApiPrediction {
  return {
    predictions: {
      percent: {
        home: `${prediction.prob_home_win}%`,
        draw: `${prediction.prob_draw}%`,
        away: `${prediction.prob_away_win}%`,
      },
    }
  };
}

async function main() {
  loadEnv();

  if (!process.env.FOOTBALL_DATA_ORG_KEY || process.env.FOOTBALL_DATA_ORG_KEY === "your_api_key_here") {
    console.error("❌  Zet FOOTBALL_DATA_ORG_KEY in .env.local");
    process.exit(1);
  }
  if (!process.env.BZZOIRO_TOKEN || process.env.BZZOIRO_TOKEN === "your_token_here") {
    console.warn("⚠️   BZZOIRO_TOKEN niet gevonden — predictions worden overgeslagen (Poisson fallback)");
  }

  console.log("📡  Standings + matches ophalen van football-data.org...");
  const [standings, rawFixtures] = await Promise.all([
    fetchFootballDataOrgStandings(),
    fetchFootballDataOrgMatches(),
  ]);
  if (standings.length === 0) {
    throw new Error("Geen standings ontvangen van football-data.org; bestaand databestand blijft ongewijzigd.");
  }
  console.log(`   ${standings.length} teams, ${rawFixtures.length} resterende wedstrijden`);

  // Predictions ophalen (best-effort) — match by team pair key
  const predictionMap = new Map<string, ApiPrediction>();
  const fixturePairKeys = new Set(
    rawFixtures.map((f) => teamPairKey(f.teams.home.name, f.teams.away.name))
  );

  if (process.env.BZZOIRO_TOKEN && process.env.BZZOIRO_TOKEN !== "your_token_here") {
    console.log("📡  Predictions ophalen van bzzoiro (best-effort)...");
    const predResult = await Promise.allSettled([fetchUpcomingPredictions()]);
    if (predResult[0].status === "fulfilled") {
      predResult[0].value.forEach((pred) => {
        const key = teamPairKey(pred.event.home_team, pred.event.away_team);
        if (fixturePairKeys.has(key)) {
          predictionMap.set(key, toApiPrediction(pred));
        }
      });
    } else {
      console.warn(`⚠️   Predictions niet beschikbaar: ${predResult[0].reason}`);
    }
  }
  console.log(`   ${predictionMap.size}/${rawFixtures.length} predictions ontvangen`);

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
