"use client";

import { useState } from "react";
import { SimulationResult } from "@/lib/simulation";
import type { Explanation } from "@/app/page";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
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
}: {
  result: SimulationResult;
  explanation: Explanation;
  fetchedAt: string | null;
  simulatedAt: string;
}) {
  const [showExplanation, setShowExplanation] = useState(false);

  const topProb = result.dateProbabilities.reduce((max, dp) =>
    dp.probability > max.probability ? dp : max,
    result.dateProbabilities[0]
  );

  const championCount = explanation.iterations - explanation.neverChampionCount;

  return (
    <section
      aria-label="PSV Kampioen statistieken"
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
            "linear-gradient(rgba(232,0,28,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(232,0,28,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          zIndex: 0,
        }}
      />

      {/* Big red glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -60%)",
          width: "700px",
          height: "700px",
          background: "radial-gradient(circle, rgba(232,0,28,0.2) 0%, transparent 70%)",
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
          background: "var(--psv-red)",
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
          background: "var(--psv-red)",
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
            color: "var(--psv-red)",
            textTransform: "uppercase",
            marginBottom: "1.5rem",
          }}
        >
          Eredivisie 2025/26 &nbsp;·&nbsp; Seizoen Simulatie
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
              ? `Data: ${new Date(fetchedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`
              : `Sim: ${new Date(simulatedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`}
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
          <span style={{ display: "block", color: "#fff" }}>PSV</span>
          <span
            style={{
              display: "block",
              color: "var(--psv-red)",
              WebkitTextStroke: "2px var(--psv-red)",
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
          Monte Carlo simulatie op basis van 50.000 scenario's. Wanneer en hoe waarschijnlijk wordt PSV kampioen?
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
            label="Kans op Kampioenschap"
            value={formatProbability(result.totalChampionshipProbability)}
            highlight
          />
          <StatCard
            label="Best Case Scenario"
            value={result.bestCaseDate ? formatDate(result.bestCaseDate) : "?"}
          />
          <StatCard
            label="Meest Waarschijnlijk"
            value={topProb ? formatDate(topProb.date) : "?"}
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
            e.currentTarget.style.borderColor = "var(--psv-red)";
            e.currentTarget.style.color = "#ccc";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#333";
            e.currentTarget.style.color = "#888";
          }}
        >
          {showExplanation ? "Sluiten" : "Hoe is dit berekend?"}
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
              Hoe is dit berekend?
            </h2>

            <p style={{ marginBottom: "1rem" }}>
              PSV staat op <strong style={{ color: "#fff" }}>{explanation.psvPoints} punten</strong> na{" "}
              <strong style={{ color: "#fff" }}>{explanation.psvPlayed}</strong> wedstrijden
              (nog <strong style={{ color: "#fff" }}>{explanation.psvRemaining}</strong> te spelen).
            </p>

            <p style={{ marginBottom: "0.75rem", color: "#777", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Concurrenten — maximaal haalbare punten
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
                  <th style={{ textAlign: "left", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>Team</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>Punten</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>Max</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>Achterstand</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0", color: "#666", fontWeight: 500 }}>Pakt max</th>
                </tr>
              </thead>
              <tbody>
                {explanation.rivals.map((r) => (
                  <tr key={r.name} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td style={{ padding: "0.4rem 0", color: "#ccc" }}>{r.name}</td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0" }}>{r.points}</td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0", color: r.maxPoints >= explanation.psvPoints ? "var(--psv-red)" : "#666" }}>
                      {r.maxPoints}
                    </td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0" }}>{r.gap}</td>
                    <td style={{ textAlign: "right", padding: "0.4rem 0", color: "#666" }}>{(r.winAllProb * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginBottom: "0.5rem" }}>
              De simulatie draaide <strong style={{ color: "#fff" }}>{explanation.iterations.toLocaleString("nl-NL")}</strong>{" "}
              scenario&apos;s. In <strong style={{ color: "#fff" }}>{championCount.toLocaleString("nl-NL")}</strong>{" "}
              daarvan werd PSV kampioen
              {explanation.neverChampionCount > 0 && (
                <> (in <strong style={{ color: "#fff" }}>{explanation.neverChampionCount.toLocaleString("nl-NL")}</strong> niet)</>
              )}.
            </p>

            <p style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#fff" }}>Best Case Scenario</strong> is de vroegst mogelijke
              kampioensdatum: de ronde waarin PSV wiskundig kampioen is als ze alle resterende
              wedstrijden winnen en concurrenten de verwachte resultaten behalen.
            </p>

            <p style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "#fff" }}>Meest Waarschijnlijk</strong> is de datum met de
              hoogste kans in de simulatie — de piek van de kansverdeling.
            </p>

            <p style={{ marginBottom: "1rem" }}>
              Dat deze twee op dezelfde datum vallen is logisch: PSV&apos;s voorsprong is zo groot dat
              in de meeste simulaties het kampioenschap al in de vroegst mogelijke ronde wordt
              beslist.
            </p>

            <p style={{ color: "#555", fontSize: "0.75rem", marginTop: "0.75rem" }}>
              Wedstrijdkansen komen van API-Football predictions. Bij ontbrekende predictions wordt een Poisson-model gebruikt
              op basis van de competitiestand.
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
          Zorg er dus voor dat je de dag erna vrij hebt! 🎉
        </p>

        <a
          href="https://ko-fi.com/baslijten"
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
            background: "var(--psv-red)",
            borderRadius: "6px",
            padding: "0.75rem 2rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            transition: "transform 0.2s, box-shadow 0.2s",
            boxShadow: "0 0 20px rgba(232,0,28,0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = "0 0 30px rgba(232,0,28,0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(232,0,28,0.3)";
          }}
        >
          🍺 Vind je dit leuk? Koop een biertje voor mij op het kampioenschap!
        </a>

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
          Scroll
        </span>
        <div
          style={{
            width: "1px",
            height: "40px",
            background: "linear-gradient(to bottom, var(--psv-red), transparent)",
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

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? "var(--psv-red)" : "var(--dark-3)",
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
    </div>
  );
}
