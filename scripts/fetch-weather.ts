/**
 * npm run fetch-weather
 *
 * Fetches historical weather data for match days and stores it in weather.json.
 * - Past dates → Historical API (actual weather)
 * - Future dates >16 days → Historical API for same date last year (estimate)
 * - Dates within 16 days → skipped (handled server-side at request time)
 *
 * Uses Open-Meteo (free, no API key required).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { resolveLeague } from "../config/env";
import { clubs } from "../config/clubs";
import type { Fixture } from "../lib/data";
import {
  fetchOpenMeteoDaily,
  parseDailyResponse,
  type WeatherData,
  type WeatherFile,
} from "../lib/weather";

interface StandingsFile {
  teams: unknown[];
  remainingFixtures: Fixture[];
  fetchedAt: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
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

  const league = resolveLeague();
  console.log(`League: ${league.name} (${league.id})`);

  const dataDir = join(process.cwd(), league.dataDir);

  // Read fixtures from standings.json
  const standingsPath = join(dataDir, "standings.json");
  if (!existsSync(standingsPath)) {
    console.error(
      `${league.dataDir}/standings.json niet gevonden. Draai eerst: npm run fetch-data`
    );
    process.exit(1);
  }

  const standings = JSON.parse(
    readFileSync(standingsPath, "utf-8")
  ) as StandingsFile;

  // Load existing weather data to skip already-fetched dates
  const weatherPath = join(dataDir, "weather.json");
  let existing: WeatherFile = { fetchedAt: "" };
  if (existsSync(weatherPath)) {
    existing = JSON.parse(readFileSync(weatherPath, "utf-8")) as WeatherFile;
  }

  // Find clubs in this league
  const leagueClubs = Object.values(clubs).filter(
    (c) => c.leagueId === league.id
  );

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const forecastLimit = new Date(now);
  forecastLimit.setDate(forecastLimit.getDate() + 16);
  const forecastLimitStr = forecastLimit.toISOString().slice(0, 10);

  for (const club of leagueClubs) {
    console.log(`\nWeather voor ${club.name}...`);

    const existingClubWeather = (existing[club.id] as Record<string, WeatherData>) ?? {};
    const result: Record<string, WeatherData> = { ...existingClubWeather };

    // Get fixture dates for this club
    const clubFixtureDates = [
      ...new Set(
        standings.remainingFixtures
          .filter((f) => f.homeTeam === club.id || f.awayTeam === club.id)
          .map((f) => f.date.slice(0, 10))
      ),
    ].sort();

    // Categorize dates
    const historicalDates: string[] = [];
    const estimateDates: string[] = [];

    for (const date of clubFixtureDates) {
      if (result[date]) {
        // Already have data — skip unless it was an estimate and now we can get actual
        if (date < today && result[date].source === "historical-estimate") {
          historicalDates.push(date);
        }
        continue;
      }

      if (date < today) {
        historicalDates.push(date);
      } else if (date > forecastLimitStr) {
        estimateDates.push(date);
      }
      // Dates within forecast window are handled server-side
    }

    // Fetch historical weather (actual past data)
    if (historicalDates.length > 0) {
      console.log(`  Historical: ${historicalDates.length} dates`);
      const sorted = [...historicalDates].sort();
      const startDate = sorted[0];
      const endDate = sorted[sorted.length - 1];

      try {
        const response = await fetchOpenMeteoDaily(
          club.coordinates.latitude,
          club.coordinates.longitude,
          startDate,
          endDate,
          "archive"
        );
        const data = parseDailyResponse(response, "historical");
        const dateSet = new Set(historicalDates);
        for (const d of data) {
          if (dateSet.has(d.date)) {
            result[d.date] = d;
          }
        }
      } catch (err) {
        console.warn(
          `  Historical fetch mislukt: ${err instanceof Error ? err.message : err}`
        );
      }
      await sleep(500); // rate limit courtesy
    }

    // Fetch historical estimates (same date last year)
    if (estimateDates.length > 0) {
      console.log(`  Historical estimates: ${estimateDates.length} dates`);
      const lastYearDates = estimateDates.map((d) => {
        const date = new Date(d);
        date.setFullYear(date.getFullYear() - 1);
        return { original: d, lastYear: date.toISOString().slice(0, 10) };
      });

      const sorted = [...lastYearDates].sort((a, b) =>
        a.lastYear.localeCompare(b.lastYear)
      );
      const startDate = sorted[0].lastYear;
      const endDate = sorted[sorted.length - 1].lastYear;

      try {
        const response = await fetchOpenMeteoDaily(
          club.coordinates.latitude,
          club.coordinates.longitude,
          startDate,
          endDate,
          "archive"
        );
        const data = parseDailyResponse(response, "historical-estimate");
        const dateMap = new Map(
          lastYearDates.map((d) => [d.lastYear, d.original])
        );
        for (const d of data) {
          const originalDate = dateMap.get(d.date);
          if (originalDate) {
            result[originalDate] = { ...d, date: originalDate };
          }
        }
      } catch (err) {
        console.warn(
          `  Estimate fetch mislukt: ${err instanceof Error ? err.message : err}`
        );
      }
      await sleep(500);
    }

    existing[club.id] = result;
    console.log(`  ${Object.keys(result).length} dates totaal`);
  }

  existing.fetchedAt = new Date().toISOString();
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(weatherPath, JSON.stringify(existing, null, 2));
  console.log(`\n${league.dataDir}/weather.json opgeslagen`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
