"use client";

import { DateProbability } from "@/lib/simulation";
import type { Team } from "@/lib/data";
import type { ClubConfig } from "@/config/clubs";
import type { LeagueClientConfig } from "@/config/env";
import type { LocaleStrings } from "@/config/locales/nl";
import type { WeatherData } from "@/lib/weather";
import { formatTemplate } from "@/config/env";
import WeatherBadge from "./WeatherBadge";

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export default function ChampionshipTimeline({
  dates,
  club,
  league,
  texts,
  teams,
  weather,
}: {
  dates: DateProbability[];
  club: ClubConfig;
  league: LeagueClientConfig;
  texts: LocaleStrings;
  teams: Team[];
  weather: Record<string, WeatherData>;
}) {
  const maxProb = Math.max(...dates.map((d) => d.probability));
  const hasNonZeroProb = maxProb > 0;

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
  };

  function getOpponentName(opponentId: string): string {
    if (opponentId === "vrij" || opponentId === "free") return texts.timelineFreeRound;
    const team = teams.find((t) => t.id === opponentId);
    return team ? team.shortName : opponentId;
  }

  return (
    <section
      aria-label={texts.timelineSectionLabel}
      style={{
        padding: "6rem 2rem",
        background: "var(--dark-2)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label={texts.timelineSectionLabel}
          title={formatTemplate(texts.timelineTitle, templateVars)}
          subtitle={formatTemplate(texts.timelineSubtitle, templateVars)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {dates.map((dp, i) => {
            const barWidth = maxProb > 0 ? (dp.probability / maxProb) * 100 : 0;
            const pct = (dp.probability * 100).toFixed(1);
            const isTop = hasNonZeroProb && dp.probability === maxProb;
            const opponentName = getOpponentName(dp.opponent);

            return (
              <div
                key={dp.date}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr 70px",
                  alignItems: "center",
                  gap: "1.5rem",
                  padding: "1.25rem 1.5rem",
                  borderBottom: i < dates.length - 1 ? "1px solid var(--dark-4)" : "none",
                  background: isTop ? "var(--club-primary-glow)" : "transparent",
                  transition: "background 0.2s",
                  position: "relative",
                }}
              >
                {isTop && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "3px",
                      background: "var(--club-primary)",
                    }}
                  />
                )}

                {/* Date + matchup */}
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: isTop ? "var(--club-primary)" : "#fff",
                    }}
                  >
                    {formatDate(dp.date, league.locale)}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "#555", marginTop: "2px" }}>
                    {texts.timelineRound} {dp.round}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "#666", marginTop: "1px" }}>
                    {dp.isHome ? `${texts.timelineVs} ` : `${texts.timelineAt} `}{opponentName}
                  </p>
                  <WeatherBadge
                    weather={weather[dp.date.slice(0, 10)]}
                    expectedLabel={texts.weatherExpected}
                  />
                </div>

                {/* Bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div
                    style={{
                      height: "8px",
                      background: "var(--dark-4)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${barWidth}%`,
                        background: isTop
                          ? "var(--club-primary)"
                          : "linear-gradient(90deg, var(--club-primary-deep), var(--club-primary))",
                        borderRadius: "4px",
                        transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      height: "4px",
                      background: "var(--dark-4)",
                      borderRadius: "2px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${dp.cumulativeProbability * 100}%`,
                        background: "linear-gradient(90deg, var(--club-primary-glow), var(--club-primary-glow))",
                        borderRadius: "2px",
                        transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    />
                  </div>
                </div>

                {/* Percentages */}
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.3rem",
                      fontWeight: 700,
                      color: isTop ? "var(--club-primary)" : "#fff",
                    }}
                  >
                    {pct}%
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: "#666",
                      marginTop: "2px",
                    }}
                  >
                    {(dp.cumulativeProbability * 100).toFixed(1)}%
                  </p>
                  {isTop && (
                    <p
                      style={{
                        fontSize: "0.6rem",
                        color: "var(--club-primary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginTop: "2px",
                      }}
                    >
                      {texts.timelineMostLikely}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Zero chance note */}
        <p
          style={{
            marginTop: "1.5rem",
            fontSize: "0.75rem",
            color: "#444",
            textAlign: "center",
          }}
        >
          {texts.timelineFootnote}
        </p>
      </div>
    </section>
  );
}

export function SectionHeader({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: "3rem" }}>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.75rem",
          letterSpacing: "0.3em",
          color: "var(--club-primary)",
          textTransform: "uppercase",
          marginBottom: "0.75rem",
        }}
      >
        {label}
      </p>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(2rem, 5vw, 3.5rem)",
          fontWeight: 700,
          textTransform: "uppercase",
          lineHeight: 1,
          color: "#fff",
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#555",
            fontSize: "0.9rem",
            maxWidth: "500px",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
