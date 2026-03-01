"use client";

import { Team, Fixture } from "@/lib/data";
import { SectionHeader } from "./ChampionshipTimeline";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

const teamNames: Record<string, string> = {
  psv: "PSV",
  ajax: "Ajax",
  feyenoord: "Feyenoord",
  az: "AZ",
  utrecht: "Utrecht",
  twente: "Twente",
};

export default function BestCaseView({
  bestCaseDate,
  bestCaseRound,
  teams,
  fixtures,
}: {
  bestCaseDate: string | null;
  bestCaseRound: number | null;
  teams: Team[];
  fixtures: Fixture[];
}) {
  const psvFixtures = fixtures.filter((f) => f.isPSV).sort((a, b) => a.round - b.round);
  const psv = teams.find((t) => t.id === "psv")!;

  // Simulate points accumulation in best case
  let runningPoints = psv.points;
  const fixtureRows = psvFixtures.map((f) => {
    runningPoints += 3;
    const isChampionMatch = f.round === bestCaseRound;
    const opponent = f.homeTeam === "psv" ? f.awayTeam : f.homeTeam;
    return {
      ...f,
      opponent: teamNames[opponent] || opponent,
      isHome: f.homeTeam === "psv",
      pointsAfter: runningPoints,
      isChampionMatch,
    };
  });

  return (
    <section
      aria-label="Best case scenario overzicht"
      style={{
        padding: "6rem 2rem",
        background: "var(--dark)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label="Best Case Scenario"
          title="Als PSV alles wint..."
          subtitle={
            bestCaseDate
              ? `PSV wordt kampioen op ${formatDate(bestCaseDate)} in ronde ${bestCaseRound}`
              : "Berekening nog bezig..."
          }
        />

        {/* Big highlight card */}
        {bestCaseDate && (
          <div
            style={{
              background: "linear-gradient(135deg, var(--psv-red) 0%, var(--psv-red-deep) 100%)",
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
              Vroegst mogelijke kampioensdatum
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
              {formatDate(bestCaseDate)}
            </p>
            <p
              style={{
                marginTop: "0.75rem",
                color: "rgba(255,255,255,0.6)",
                fontSize: "0.9rem",
              }}
            >
              Ronde {bestCaseRound} · Als PSV alle resterende wedstrijden wint
            </p>
          </div>
        )}

        {/* Fixture list */}
        <div
          style={{
            border: "1px solid var(--dark-4)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
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
            {["Ronde", "Wedstrijd", "Resultaat", "Punten"].map((h) => (
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
                background: f.isChampionMatch ? "rgba(232,0,28,0.12)" : "transparent",
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
                    background: "var(--psv-red)",
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
                  {f.isHome ? `PSV vs ${f.opponent}` : `${f.opponent} vs PSV`}
                </p>
                <p style={{ fontSize: "0.7rem", color: "#444", marginTop: "2px" }}>
                  {formatShortDate(f.date)} · {f.isHome ? "Thuis" : "Uit"}
                  {f.isChampionMatch && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        color: "var(--psv-red)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontSize: "0.65rem",
                      }}
                    >
                      🏆 Kampioen
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
                Winst (+3)
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: f.isChampionMatch ? "var(--psv-red)" : "#fff",
                }}
              >
                {f.pointsAfter}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
