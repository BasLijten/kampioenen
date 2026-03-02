"use client";

import { SectionHeader } from "./ChampionshipTimeline";
import type { ClubSimulationResult } from "@/lib/simulation";
import type { Team } from "@/lib/data";
import type { ClubConfig } from "@/config/clubs";
import type { LeagueClientConfig } from "@/config/env";
import type { LocaleStrings } from "@/config/locales/nl";
import { formatTemplate } from "@/config/env";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

export default function EndOfSeasonPrediction({
  clubResults,
  teams,
  club,
  league,
  texts,
}: {
  clubResults: Record<string, ClubSimulationResult>;
  teams: Team[];
  club: ClubConfig;
  league: LeagueClientConfig;
  texts: LocaleStrings;
}) {
  const N = teams.length;
  const positions = Array.from({ length: N }, (_, i) => i + 1);

  // Sort teams by expected final position (probability-weighted average)
  const sorted = [...teams].sort((a, b) => {
    const ra = clubResults[a.id];
    const rb = clubResults[b.id];
    const expA = ra
      ? Object.entries(ra.positionProbabilities).reduce((s, [p, pr]) => s + Number(p) * pr, 0)
      : 99;
    const expB = rb
      ? Object.entries(rb.positionProbabilities).reduce((s, [p, pr]) => s + Number(p) * pr, 0)
      : 99;
    return expA - expB;
  });

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
    count: String(N),
  };

  function getCellBg(teamId: string, pos: number): string {
    const result = clubResults[teamId];
    if (!result) return "transparent";
    const prob = result.positionProbabilities[pos] ?? 0;
    if (prob < 0.001) return "transparent";
    const intensity = Math.min(0.9, Math.sqrt(prob) * 1.3);
    if (teamId === club.id) {
      return hexToRgba(club.primaryColor, intensity);
    }
    return `rgba(255,255,255,${(intensity * 0.35).toFixed(2)})`;
  }

  function getCellText(teamId: string, pos: number): string {
    const result = clubResults[teamId];
    if (!result) return "";
    const prob = result.positionProbabilities[pos] ?? 0;
    if (prob < 0.005) return "";
    const pct = prob * 100;
    if (pct >= 99.5) return "100%";
    if (pct >= 10) return `${Math.round(pct)}%`;
    return `${pct.toFixed(1)}%`;
  }

  const CELL_W = 40;
  const NAME_W = 110;

  return (
    <section
      aria-label={texts.predictionSectionLabel}
      style={{ padding: "6rem 2rem", background: "var(--dark-3)" }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label={texts.predictionSectionLabel}
          title={formatTemplate(texts.predictionTitle, templateVars)}
          subtitle={formatTemplate(texts.predictionSubtitle, templateVars)}
        />

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: `${NAME_W + N * CELL_W + (N - 1) * 2}px` }}>
            {/* Header row — position numbers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${NAME_W}px repeat(${N}, ${CELL_W}px)`,
                gap: "2px",
                marginBottom: "4px",
              }}
            >
              <div />
              {positions.map((pos) => (
                <div
                  key={pos}
                  style={{
                    textAlign: "center",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.08em",
                    color: "#555",
                    padding: "2px 0 6px",
                  }}
                >
                  {pos}
                </div>
              ))}
            </div>

            {/* Team rows */}
            {sorted.map((team) => {
              const isClub = team.id === club.id;
              return (
                <div
                  key={team.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${NAME_W}px repeat(${N}, ${CELL_W}px)`,
                    gap: "2px",
                    marginBottom: "2px",
                    background: isClub ? "var(--club-primary-glow)" : "transparent",
                    borderLeft: isClub
                      ? "3px solid var(--club-primary)"
                      : "3px solid transparent",
                  }}
                >
                  {/* Team name */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: "0.5rem",
                      fontFamily: "var(--font-display)",
                      fontSize: "0.8rem",
                      color: isClub ? "#fff" : "#888",
                      fontWeight: isClub ? 600 : 400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {team.shortName}
                  </div>

                  {/* Position cells */}
                  {positions.map((pos) => {
                    const bg = getCellBg(team.id, pos);
                    const text = getCellText(team.id, pos);
                    const hasColor = bg !== "transparent";
                    return (
                      <div
                        key={pos}
                        style={{
                          height: "34px",
                          background: bg,
                          borderRadius: "2px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "var(--font-display)",
                          fontSize: "0.58rem",
                          color: isClub && hasColor ? "#fff" : "#bbb",
                          fontWeight: text ? 700 : 400,
                        }}
                      >
                        {text}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <p
          style={{
            marginTop: "1.25rem",
            fontSize: "0.68rem",
            color: "#444",
            textAlign: "center",
          }}
        >
          {formatTemplate(texts.predictionFootnote, templateVars)}
        </p>
      </div>
    </section>
  );
}
