"use client";

import { SimulationResult } from "@/lib/simulation";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function HeroSection({
  result,
  fetchedAt,
  simulatedAt,
}: {
  result: SimulationResult;
  fetchedAt: string | null;
  simulatedAt: string;
}) {
  const topProb = result.dateProbabilities.reduce((max, dp) =>
    dp.probability > max.probability ? dp : max,
    result.dateProbabilities[0]
  );

  return (
    <section
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
          Eredivisie 2024/25 &nbsp;·&nbsp; Seizoen Simulatie
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
            value={`${(result.totalChampionshipProbability * 100).toFixed(1)}%`}
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
