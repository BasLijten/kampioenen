// --- Types ---

export type WeatherSource = "forecast" | "historical" | "historical-estimate";

export type WeatherCategory =
  | "sunny"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

export interface WeatherData {
  date: string;
  weatherCode: number;
  category: WeatherCategory;
  temperatureMax: number;
  temperatureMin: number;
  precipitationSum: number;
  windSpeedMax: number;
  source: WeatherSource;
}

export interface WeatherFile {
  [clubId: string]: Record<string, WeatherData> | string;
  fetchedAt: string;
}

// --- WMO weather code mapping ---

export function wmoToCategory(code: number): WeatherCategory {
  if (code === 0) return "sunny";
  if (code <= 3) return "partly-cloudy";
  if (code <= 49) return "fog";
  if (code <= 59) return "drizzle";
  if (code <= 69) return "rain";
  if (code <= 79) return "snow";
  if (code <= 84) return "rain";
  if (code <= 86) return "snow";
  if (code <= 99) return "thunderstorm";
  return "cloudy";
}

export function categoryToIcon(category: WeatherCategory): string {
  const icons: Record<WeatherCategory, string> = {
    sunny: "\u2600\uFE0F",
    "partly-cloudy": "\u26C5",
    cloudy: "\u2601\uFE0F",
    fog: "\uD83C\uDF2B\uFE0F",
    drizzle: "\uD83C\uDF26\uFE0F",
    rain: "\uD83C\uDF27\uFE0F",
    snow: "\u2744\uFE0F",
    thunderstorm: "\u26C8\uFE0F",
  };
  return icons[category];
}

// --- Open-Meteo fetch helper ---

export interface OpenMeteoDailyResponse {
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    wind_speed_10m_max: number[];
  };
}

export async function fetchOpenMeteoDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  endpoint: "forecast" | "archive"
): Promise<OpenMeteoDailyResponse> {
  const base =
    endpoint === "forecast"
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive";

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
    timezone: "Europe/Amsterdam",
  });

  const res = await fetch(`${base}?${params}`);
  if (!res.ok) {
    throw new Error(
      `Open-Meteo ${endpoint} error ${res.status}: ${await res.text()}`
    );
  }
  return res.json() as Promise<OpenMeteoDailyResponse>;
}

export function parseDailyResponse(
  response: OpenMeteoDailyResponse,
  source: WeatherSource
): WeatherData[] {
  const { daily } = response;
  return daily.time.map((date, i) => ({
    date,
    weatherCode: daily.weather_code[i],
    category: wmoToCategory(daily.weather_code[i]),
    temperatureMax: daily.temperature_2m_max[i],
    temperatureMin: daily.temperature_2m_min[i],
    precipitationSum: daily.precipitation_sum[i],
    windSpeedMax: daily.wind_speed_10m_max[i],
    source,
  }));
}
