import type { WeatherData } from "@/lib/weather";
import { categoryToIcon } from "@/lib/weather";

export default function WeatherBadge({
  weather,
  expectedLabel,
}: {
  weather: WeatherData | undefined;
  expectedLabel: string;
}) {
  if (!weather) return null;

  const icon = categoryToIcon(weather.category);
  const tempMin = Math.round(weather.temperatureMin);
  const tempMax = Math.round(weather.temperatureMax);

  return (
    <span
      style={{
        fontSize: "0.8rem",
        color: "#666",
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
      }}
    >
      <span style={{ fontSize: "1.2rem" }}>{icon}</span>
      <span>
        {tempMin}&ndash;{tempMax}&deg;
      </span>
      {weather.source === "historical-estimate" && (
        <span style={{ color: "#555", fontStyle: "italic" }}>
          ({expectedLabel})
        </span>
      )}
    </span>
  );
}
