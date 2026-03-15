"use client";

import { Team, Fixture } from "@/lib/data";
import { SectionHeader } from "./ChampionshipTimeline";
import type { ClubConfig } from "@/config/clubs";
import type { LeagueClientConfig } from "@/config/env";
import type { LocaleStrings } from "@/config/locales/nl";
import type { WeatherData } from "@/lib/weather";
import { formatTemplate } from "@/config/env";
import WeatherBadge from "./WeatherBadge";

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export default function BestCaseView({
  bestCaseDate,
  bestCaseRound,
  teams,
  fixtures,
  club,
  league,
  texts,
  weather,
}: {
  bestCaseDate: string | null;
  bestCaseRound: number | null;
  teams: Team[];
  fixtures: Fixture[];
  club: ClubConfig;
  league: LeagueClientConfig;
  texts: LocaleStrings;
  weather: Record<string, WeatherData>;
}) {
  const clubFixtures = fixtures
    .filter((f) => f.homeTeam === club.id || f.awayTeam === club.id)
    .sort((a, b) => a.round - b.round);
  const clubTeam = teams.find((t) => t.id === club.id)!;

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
  };

  function getTeamName(teamId: string): string {
    const team = teams.find((t) => t.id === teamId);
    return team ? team.shortName : teamId;
  }

  // Simulate points accumulation in best case
  let runningPoints = clubTeam.points;
  const fixtureRows = clubFixtures.map((f) => {
    runningPoints += 3;
    const isChampionMatch = f.round === bestCaseRound;
    const opponent = f.homeTeam === club.id ? f.awayTeam : f.homeTeam;
    return {
      ...f,
      opponent: getTeamName(opponent),
      isHome: f.homeTeam === club.id,
      pointsAfter: runningPoints,
      isChampionMatch,
    };
  });

  return (
    <section
      aria-label={texts.bestCaseSectionLabel}
      style={{
        padding: "6rem 2rem",
        background: "var(--dark)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label={texts.bestCaseSectionLabel}
          title={formatTemplate(texts.bestCaseTitle, templateVars)}
          subtitle={
            bestCaseDate
              ? formatTemplate(texts.bestCaseSubtitle, {
                  ...templateVars,
                  date: formatDate(bestCaseDate, league.locale),
                  round: String(bestCaseRound),
                })
              : undefined
          }
        />

        {/* Big highlight card */}
        {bestCaseDate && (
          <div
            style={{
              background: "linear-gradient(135deg, var(--club-primary) 0%, var(--club-primary-deep) 100%)",
              borderRadius: "4px",
              padding: "2.5rem 3rem",
              marginBottom: "3rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: "-2rem",
                top: "-2rem",
                width: "200px",
                height: "200px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
              }}
            />
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.8rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)",
                marginBottom: "0.5rem",
              }}
            >
              {texts.bestCaseHighlightLabel}
            </p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 6vw, 4rem)",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {formatDate(bestCaseDate, league.locale)}
            </p>
            <p
              style={{
                marginTop: "0.75rem",
                color: "rgba(255,255,255,0.6)",
                fontSize: "0.9rem",
              }}
            >
              {formatTemplate(texts.bestCaseHighlightRound, {
                ...templateVars,
                round: String(bestCaseRound),
              })}
            </p>
          </div>
        )}

        {/* Fixture list */}
        <div
          style={{
            border: "1px solid var(--dark-4)",
            borderRadius: "4px",
            overflowX: "auto",
          }}
        >
          <div style={{ minWidth: "360px" }}>
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 80px 80px",
              padding: "0.75rem 1.25rem",
              background: "var(--dark-3)",
              borderBottom: "1px solid var(--dark-4)",
            }}
          >
            {[texts.bestCaseColumnRound, texts.bestCaseColumnMatch, texts.bestCaseColumnResult, texts.bestCaseColumnPoints].map((h) => (
              <p
                key={h}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#444",
                }}
              >
                {h}
              </p>
            ))}
          </div>

          {fixtureRows.map((f, i) => (
            <div
              key={f.id}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 80px 80px",
                padding: "1rem 1.25rem",
                alignItems: "center",
                borderBottom: i < fixtureRows.length - 1 ? "1px solid var(--dark-4)" : "none",
                background: f.isChampionMatch ? "var(--club-primary-glow)" : "transparent",
                position: "relative",
              }}
            >
              {f.isChampionMatch && (
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
              <p style={{ color: "#555", fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>
                {f.round}
              </p>
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.95rem",
                    color: f.isChampionMatch ? "#fff" : "#ccc",
                  }}
                >
                  {f.isHome ? `${club.shortName} vs ${f.opponent}` : `${f.opponent} vs ${club.shortName}`}
                </p>
                <p style={{ fontSize: "0.7rem", color: "#444", marginTop: "2px" }}>
                  {formatShortDate(f.date, league.locale)} · {f.isHome ? texts.bestCaseHome : texts.bestCaseAway}
                  {" "}
                  <WeatherBadge
                    weather={weather[f.date.slice(0, 10)]}
                    expectedLabel={texts.weatherExpected}
                  />
                  {f.isChampionMatch && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        color: "var(--club-primary)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontSize: "0.65rem",
                      }}
                    >
                      {texts.bestCaseChampionBadge}
                    </span>
                  )}
                </p>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.9rem",
                  color: "#2ecc71",
                }}
              >
                {texts.bestCaseWin}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: f.isChampionMatch ? "var(--club-primary)" : "#fff",
                }}
              >
                {f.pointsAfter}
              </p>
            </div>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}
