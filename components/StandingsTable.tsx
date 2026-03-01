"use client";

import { Team } from "@/lib/data";
import { SectionHeader } from "./ChampionshipTimeline";

export default function StandingsTable({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => b.points - a.points).slice(0, 6);
  const psv = sorted.find((t) => t.id === "psv")!;

  return (
    <section
      style={{
        padding: "6rem 2rem",
        background: "var(--dark-3)",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label="Huidige Stand"
          title={`Eredivisie Top ${sorted.length}`}
          subtitle={`Stand per speelronde ${Math.max(...sorted.map((t) => t.played))}`}
        />

        <div
          style={{
            border: "1px solid var(--dark-4)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 50px 50px 50px 50px 60px 80px",
              padding: "0.75rem 1.25rem",
              background: "var(--dark-4)",
              borderBottom: "1px solid #2a2a2a",
              gap: "0.5rem",
            }}
          >
            {["#", "Club", "W", "G", "V", "Gsr", "Doel", "Pnt"].map((h) => (
              <p
                key={h}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#444",
                  textAlign: h === "#" || h === "Club" ? "left" : "center",
                }}
              >
                {h}
              </p>
            ))}
          </div>

          {sorted.map((team, i) => {
            const isPSV = team.id === "psv";
            const gap = isPSV ? null : psv.points - team.points;
            const gd = team.goalsFor - team.goalsAgainst;

            return (
              <div
                key={team.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 50px 50px 50px 50px 60px 80px",
                  padding: "1rem 1.25rem",
                  alignItems: "center",
                  gap: "0.5rem",
                  borderBottom: i < sorted.length - 1 ? "1px solid #1a1a1a" : "none",
                  background: isPSV ? "rgba(232,0,28,0.1)" : "transparent",
                  position: "relative",
                }}
              >
                {isPSV && (
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
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1rem",
                    color: isPSV ? "var(--psv-red)" : "#555",
                    fontWeight: isPSV ? 700 : 400,
                  }}
                >
                  {i + 1}
                </p>
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1rem",
                      color: isPSV ? "#fff" : "#bbb",
                      fontWeight: isPSV ? 600 : 400,
                    }}
                  >
                    {team.shortName}
                  </p>
                  {!isPSV && (
                    <p style={{ fontSize: "0.7rem", color: "#444" }}>-{gap} pnt</p>
                  )}
                </div>
                {[team.won, team.drawn, team.lost].map((val, j) => (
                  <p
                    key={j}
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.9rem",
                      color: "#777",
                      textAlign: "center",
                    }}
                  >
                    {val}
                  </p>
                ))}
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.9rem",
                    color: gd > 0 ? "#2ecc71" : gd < 0 ? "#e74c3c" : "#777",
                    textAlign: "center",
                  }}
                >
                  {gd > 0 ? "+" : ""}{gd}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.9rem",
                    color: "#777",
                    textAlign: "center",
                  }}
                >
                  {team.goalsFor}–{team.goalsAgainst}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    color: isPSV ? "var(--psv-red)" : "#fff",
                    textAlign: "center",
                  }}
                >
                  {team.points}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
