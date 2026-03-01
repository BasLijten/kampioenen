"use client";

import { DateProbability } from "@/lib/simulation";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

const teamLabels: Record<string, string> = {
  ajax: "Ajax",
  feyenoord: "Feyenoord",
  az: "AZ",
  utrecht: "Utrecht",
  twente: "Twente",
  vrij: "Vrij",
};

export default function ChampionshipTimeline({ dates }: { dates: DateProbability[] }) {
  const maxProb = Math.max(...dates.map((d) => d.probability));

  return (
    <section
      aria-label="Kampioenschap datum verdeling"
      style={{
        padding: "6rem 2rem",
        background: "var(--dark-2)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label="Datum Verdeling"
          title="Wanneer wordt PSV kampioen?"
          subtitle="Per speelronde: kans dat PSV op die datum het kampioenschap veiligstelt"
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {dates.map((dp, i) => {
            const barWidth = maxProb > 0 ? (dp.probability / maxProb) * 100 : 0;
            const pct = (dp.probability * 100).toFixed(1);
            const isTop = dp.probability === maxProb;
            const opponentName = teamLabels[dp.opponent] || dp.opponent;

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
                  background: isTop ? "rgba(232,0,28,0.07)" : "transparent",
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
                      background: "var(--psv-red)",
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
                      color: isTop ? "var(--psv-red)" : "#fff",
                    }}
                  >
                    {formatDate(dp.date)}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "#555", marginTop: "2px" }}>
                    Ronde {dp.round}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "#666", marginTop: "1px" }}>
                    {dp.isHome ? "vs " : "@ "}{opponentName}
                  </p>
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
                          ? "var(--psv-red)"
                          : "linear-gradient(90deg, #6b0010, #b0001a)",
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
                        background: "linear-gradient(90deg, rgba(232,0,28,0.3), rgba(232,0,28,0.5))",
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
                      color: isTop ? "var(--psv-red)" : "#fff",
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
                        color: "var(--psv-red)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginTop: "2px",
                      }}
                    >
                      Meest likely
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
          Datums tonen alleen kansen boven 0.1%. Simulatie op basis van 50.000 iteraties.
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
          color: "var(--psv-red)",
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
