"use client";

import { useState } from "react";
import type { ClubSimulationResult } from "@/lib/simulation";
import type { Explanation } from "@/app/page";
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

function formatProbability(prob: number): string {
  const pct = prob * 100;
  if (pct >= 99.995) return ">99.99%";
  return `${pct.toFixed(2)}%`;
}

export default function HeroSection({
  result,
  explanation,
  fetchedAt,
  simulatedAt,
  club,
  league,
  texts,
  weather,
}: {
  result: ClubSimulationResult;
  explanation: Explanation;
  fetchedAt: string | null;
  simulatedAt: string;
  club: ClubConfig;
  league: LeagueClientConfig;
  texts: LocaleStrings;
  weather: Record<string, WeatherData>;
}) {
  const [showExplanation, setShowExplanation] = useState(false);

  const topProb = result.dateProbabilities.reduce((max, dp) =>
    dp.probability > max.probability ? dp : max,
    result.dateProbabilities[0]
  );

  const championCount = explanation.iterations - explanation.neverChampionCount;

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
  };

  return (
    <section
      aria-label={`${club.shortName} ${texts.statChampionshipChance}`}
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "2rem",
        background: "var(--dark)",
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(var(--club-primary-glow) 1px, transparent 1px), linear-gradient(90deg, var(--club-primary-glow) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          zIndex: 0,
        }}
      />

      {/* Big glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -60%)",
          width: "700px",
          height: "700px",
          background: "radial-gradient(circle, var(--club-primary-glow) 0%, transparent 70%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* Diagonal accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "40%",
          height: "4px",
          background: "var(--club-primary)",
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "40%",
          height: "4px",
          background: "var(--club-primary)",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: "900px" }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.85rem",
            letterSpacing: "0.3em",
            color: "var(--club-primary)",
            textTransform: "uppercase",
            marginBottom: "1.5rem",
          }}
        >
          {formatTemplate(texts.heroSubtitle, templateVars)}
          <span
            style={{
              marginLeft: "1rem",
              fontSize: "0.7rem",
              color: "#555",
              letterSpacing: "0.1em",
              fontFamily: "var(--font-body)",
              textTransform: "none",
            }}
          >
            {fetchedAt
              ? `Data: ${new Date(fetchedAt).toLocaleDateString(league.locale, { day: "numeric", month: "short" })}`
              : `Sim: ${new Date(simulatedAt).toLocaleDateString(league.locale, { day: "numeric", month: "short" })}`}
          </span>
        </p>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(3.5rem, 10vw, 9rem)",
            fontWeight: 700,
            lineHeight: 0.9,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            marginBottom: "1rem",
          }}
        >
          <span style={{ display: "block", color: "#fff" }}>{club.shortName}</span>
          <span
            style={{
              display: "block",
              color: "var(--club-primary)",
              WebkitTextStroke: "2px var(--club-primary)",
            }}
          >
            KAMPIOEN
          </span>
        </h1>

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "1.1rem",
            color: "#888",
            maxWidth: "500px",
            margin: "0 auto 3rem",
            lineHeight: 1.6,
          }}
        >
          {formatTemplate(texts.heroDescription, templateVars)}
        </p>

        {/* Three stat cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1px",
            background: "var(--gray)",
            border: "1px solid var(--gray)",
            borderRadius: "4px",
            overflow: "hidden",
            maxWidth: "720px",
            margin: "0 auto",
          }}
        >
          <StatCard
            label={texts.statChampionshipChance}
            value={formatProbability(result.totalChampionshipProbability)}
            highlight
          />
          <StatCard
            label={texts.statBestCase}
            value={result.bestCaseDate ? formatDate(result.bestCaseDate, league.locale) : "?"}
            weatherBadge={
              result.bestCaseDate ? (
                <WeatherBadge
                  weather={weather[result.bestCaseDate.slice(0, 10)]}
                  expectedLabel={texts.weatherExpected}
                />
              ) : undefined
            }
          />
          <StatCard
            label={texts.statMostLikely}
            value={topProb ? formatDate(topProb.date, league.locale) : "?"}
            weatherBadge={
              topProb ? (
                <WeatherBadge
                  weather={weather[topProb.date.slice(0, 10)]}
                  expectedLabel={texts.weatherExpected}
                />
              ) : undefined
            }
          />
        </div>

        {/* Explanation button */}
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          aria-expanded={showExplanation}
          style={{
            marginTop: "1.5rem",
            background: "none",
            border: "1px solid #333",
            borderRadius: "4px",
            color: "#888",
            fontFamily: "var(--font-body)",
            fontSize: "0.8rem",
            padding: "0.5rem 1.25rem",
            cursor: "pointer",
            letterSpacing: "0.05em",
            transition: "border-color 0.2s, color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--club-primary)";
            e.currentTarget.style.color = "#ccc";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#333";
            e.currentTarget.style.color = "#888";
          }}
        >
          {showExplanation ? texts.explanationButtonClose : texts.explanationButton}
        </button>

        {/* Explanation panel */}
        {showExplanation && (
          <div
            style={{
              marginTop: "1.5rem",
              background: "var(--dark-3)",
              border: "1px solid #222",
              borderRadius: "6px",
              padding: "1.5rem 2rem",
              textAlign: "left",
              maxWidth: "720px",
              marginLeft: "auto",
              marginRight: "auto",
              fontFamily: "var(--font-body)",
              fontSize: "0.85rem",
              color: "#aaa",
              lineHeight: 1.7,
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                color: "#fff",
                marginBottom: "1rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {texts.explanationTitle}
            </h2>

            <p
              style={{ marginBottom: "1rem" }}
              dangerouslySetInnerHTML={{
                __html: formatTemplate(texts.explanationPointsAfter, {
                  ...templateVars,
                  points: String(explanation.clubPoints),
                  played: String(explanation.clubPlayed),
                  remaining: String(explanation.clubRemaining),
                }),
              }}
            />

            <p style={{ marginBottom: "0.75rem", color: "#777", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {texts.explanationRivalsLabel}
            </p>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "1.25rem",
                fontSize: "0.82rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <th style={{ textAlign: "left", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>{texts.explanationRivalsColumns.team}</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>{texts.explanationRivalsColumns.points}</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>{texts.explanationRivalsColumns.max}</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>{texts.explanationRivalsColumns.gap}</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>{texts.explanationRivalsColumns.winAll}</th>
                </tr>
              </thead>
              <tbody>
                {explanation.rivals.map((r) => (
                  <tr key={r.name} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td style={{ padding: "0.4rem 0", color: "#ccc" }}>{r.name}</td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0" }}>{r.points}</td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0", color: r.maxPoints >= explanation.clubPoints ? "var(--club-primary)" : "#666" }}>
                      {r.maxPoints}
                    </td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0" }}>{r.gap}</td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0", color: "#666" }}>{(r.winAllProb * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginBottom: "0.5rem" }}>
              <span
                dangerouslySetInnerHTML={{
                  __html: formatTemplate(texts.explanationSimRan, {
                    ...templateVars,
                    iterations: explanation.iterations.toLocaleString(league.locale),
                  }),
                }}
              />
              {" "}
              <span
                dangerouslySetInnerHTML={{
                  __html: formatTemplate(texts.explanationBecameChampion, {
                    ...templateVars,
                    count: championCount.toLocaleString(league.locale),
                  }),
                }}
              />
              {explanation.neverChampionCount > 0 && (
                <>
                  {" "}
                  <span
                    dangerouslySetInnerHTML={{
                      __html: formatTemplate(texts.explanationDidNot, {
                        ...templateVars,
                        count: explanation.neverChampionCount.toLocaleString(league.locale),
                      }),
                    }}
                  />
                </>
              )}
              .
            </p>

            <p
              style={{ marginBottom: "0.5rem" }}
              dangerouslySetInnerHTML={{
                __html: formatTemplate(texts.explanationBestCaseDesc, templateVars),
              }}
            />

            <p
              style={{ marginBottom: "0.5rem" }}
              dangerouslySetInnerHTML={{
                __html: formatTemplate(texts.explanationMostLikelyDesc, templateVars),
              }}
            />

            <p
              style={{ marginBottom: "1rem" }}
              dangerouslySetInnerHTML={{
                __html: formatTemplate(texts.explanationBestCaseMostLikelySame, templateVars),
              }}
            />

            <p style={{ color: "#555", fontSize: "0.75rem", marginTop: "0.75rem" }}>
              {texts.explanationPredictionSource}
            </p>
          </div>
        )}

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "1.15rem",
            color: "#666",
            marginTop: "1rem",
            fontStyle: "italic",
          }}
        >
          {texts.heroCallToAction}
        </p>

        {club.kofiUrl && (
          <a
            href={club.kofiUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: "1rem",
              fontFamily: "var(--font-display)",
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "#fff",
              textDecoration: "none",
              background: "var(--club-primary)",
              borderRadius: "6px",
              padding: "0.75rem 2rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              transition: "transform 0.2s, box-shadow 0.2s",
              boxShadow: "0 0 20px var(--club-primary-glow)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = "0 0 30px var(--club-primary-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 0 20px var(--club-primary-glow)";
            }}
          >
            {formatTemplate(texts.donateButton, templateVars)}
          </a>
        )}

      </div>

      {/* Scroll indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "2rem",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          color: "#444",
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          {texts.scrollLabel}
        </span>
        <div
          style={{
            width: "1px",
            height: "40px",
            background: "linear-gradient(to bottom, var(--club-primary), transparent)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scaleY(1); }
          50% { opacity: 0.5; transform: scaleY(0.8); }
        }
      `}</style>
    </section>
  );
}

function StatCard({ label, value, highlight, weatherBadge }: { label: string; value: string; highlight?: boolean; weatherBadge?: React.ReactNode }) {
  return (
    <div
      style={{
        background: highlight ? "var(--club-primary)" : "var(--dark-3)",
        padding: "1.75rem 1.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.72rem",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: highlight ? "rgba(255,255,255,0.75)" : "#666",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
          fontWeight: 600,
          color: "#fff",
          textAlign: "center",
        }}
      >
        {value}
      </p>
      {weatherBadge}
    </div>
  );
}
