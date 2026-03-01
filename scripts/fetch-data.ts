/**
 * npm run fetch-data
 *
 * Haalt live Eredivisie data op en slaat het op als data/eredivisie.json.
 * Vereist:
 * - FOOTBALL_DATA_ORG_KEY (standings)
 * - BZZOIRO_TOKEN (events + predictions)
 *
 * Bronnen:
 * - football-data.org: standings
 * - BZZOIRO: upcoming events + upcoming predictions
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  ApiFixture,
  ApiPrediction,
} from "../lib/api-football";
import {
  fetchUpcomingEvents,
  fetchUpcomingPredictions,
  BzzEvent,
  BzzPrediction,
} from "../lib/bzzoiro";
import { fetchFootballDataOrgStandings } from "../lib/football-data-org";
import { transformStandings, transformFixtures, toTeamId } from "../lib/transform";

// Laad .env.local handmatig (tsx heeft geen Next.js env-loading)
function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (match) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // .env.local bestaat niet — vereiste variabelen moeten al in de omgeving staan
  }
}

async function main() {
  loadEnv();

  if (!process.env.FOOTBALL_DATA_ORG_KEY || process.env.FOOTBALL_DATA_ORG_KEY === "your_api_key_here") {
    console.error("❌  Zet FOOTBALL_DATA_ORG_KEY in .env.local");
    process.exit(1);
  }
  if (!process.env.BZZOIRO_TOKEN || process.env.BZZOIRO_TOKEN === "your_token_here") {
    console.error("❌  Zet BZZOIRO_TOKEN in .env.local");
    process.exit(1);
  }

  console.log("📡  Standings + events ophalen...");
  const [standings, rawEvents] = await Promise.all([
    fetchFootballDataOrgStandings(),
    fetchUpcomingEvents(),
  ]);
  if (standings.length === 0) {
    throw new Error("Geen standings ontvangen van football-data.org; bestaand databestand blijft ongewijzigd.");
  }
  const rawFixtures = rawEvents.map(toApiFixture);
  console.log(`   ${standings.length} teams, ${rawFixtures.length} resterende wedstrijden`);

  console.log("📡  Predictions ophalen (best-effort)...");
  const predictionMap = new Map<number, ApiPrediction>();
  const fixtureIds = new Set(rawFixtures.map((fixture) => fixture.fixture.id));
  const predResult = await Promise.allSettled([fetchUpcomingPredictions()]);
  let predCount = 0;
  if (predResult[0].status === "fulfilled") {
    predResult[0].value.forEach((pred) => {
      const fixtureId = predictionFixtureId(pred);
      if (fixtureIds.has(fixtureId)) {
        predictionMap.set(fixtureId, toApiPrediction(pred));
        predCount++;
      }
    });
  } else {
    console.warn(`⚠️   Predictions niet beschikbaar: ${predResult[0].reason}`);
  }
  if (predictionMap.size < predCount) {
    predCount = predictionMap.size;
  }
  console.log(`   ${predCount}/${rawFixtures.length} predictions ontvangen`);

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

function fixtureIdFromEvent(event: BzzEvent): number {
  return event.api_id ?? event.id;
}

function predictionFixtureId(prediction: BzzPrediction): number {
  return prediction.event.api_id ?? prediction.event.id;
}

function toApiFixture(event: BzzEvent): ApiFixture {
  return {
    fixture: {
      id: fixtureIdFromEvent(event),
      date: event.event_date,
    },
    league: {
      round: event.league?.round ?? "Regular Season - 0",
    },
    teams: {
      home: { id: 0, name: event.home_team },
      away: { id: 0, name: event.away_team },
    },
  };
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

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
