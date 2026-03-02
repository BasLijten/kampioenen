import { readFileSync } from "fs";
import { join } from "path";
import type { Fixture } from "./data";
import {
  parseDailyResponse,
  type OpenMeteoDailyResponse,
  type WeatherData,
  type WeatherFile,
} from "./weather";

/**
 * Server-side weather loading (called from page.tsx).
 *
 * 1. Reads pre-computed data from weather.json (historical + estimates)
 * 2. Fetches live forecast for dates within 16-day window not in the JSON
 * 3. Returns merged result
 */
export async function loadWeather(
  clubId: string,
  fixtures: Fixture[],
  coordinates: { latitude: number; longitude: number },
  leagueDataDir: string
): Promise<Record<string, WeatherData>> {
  const result: Record<string, WeatherData> = {};

  // 1. Read pre-computed weather data
  try {
    const raw = readFileSync(
      join(process.cwd(), leagueDataDir, "weather.json"),
      "utf-8"
    );
    const file = JSON.parse(raw) as WeatherFile;
    const clubWeather = file[clubId] as
      | Record<string, WeatherData>
      | undefined;
    if (clubWeather) {
      Object.assign(result, clubWeather);
    }
  } catch {
    // weather.json doesn't exist yet — continue with live forecast only
  }

  // 2. Find fixture dates for this club that need live forecast
  const clubFixtureDates = fixtures
    .filter((f) => f.homeTeam === clubId || f.awayTeam === clubId)
    .map((f) => f.date.slice(0, 10));

  const now = new Date();
  const forecastLimit = new Date(now);
  forecastLimit.setDate(forecastLimit.getDate() + 16);

  const missingDates = clubFixtureDates.filter((date) => {
    if (result[date]) return false;
    const d = new Date(date);
    return d >= now && d <= forecastLimit;
  });

  // 3. Fetch live forecast for missing dates within 16-day window
  if (missingDates.length > 0) {
    const sorted = [...missingDates].sort();
    const startDate = sorted[0];
    const endDate = sorted[sorted.length - 1];

    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
          latitude: String(coordinates.latitude),
          longitude: String(coordinates.longitude),
          start_date: startDate,
          end_date: endDate,
          daily:
            "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
          timezone: "Europe/Amsterdam",
        })}`,
        { next: { revalidate: 600 } }
      );

      if (response.ok) {
        const data = (await response.json()) as OpenMeteoDailyResponse;
        const forecasts = parseDailyResponse(data, "forecast");
        const missingSet = new Set(missingDates);
        for (const forecast of forecasts) {
          if (missingSet.has(forecast.date)) {
            result[forecast.date] = forecast;
          }
        }
      }
    } catch {
      // Live forecast failed — continue without it
    }
  }

  return result;
}
