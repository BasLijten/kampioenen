"use client";

import { Team } from "@/lib/data";
import { SectionHeader } from "./ChampionshipTimeline";
import type { ClubConfig } from "@/config/clubs";
import type { LeagueClientConfig } from "@/config/env";
import type { LocaleStrings } from "@/config/locales/nl";
import { formatTemplate } from "@/config/env";

export default function StandingsTable({
  teams,
  club,
  league,
  texts,
}: {
  teams: Team[];
  club: ClubConfig;
  league: LeagueClientConfig;
  texts: LocaleStrings;
}) {
  const sorted = [...teams].sort((a, b) => b.points - a.points).slice(0, 6);
  const clubTeam = sorted.find((t) => t.id === club.id)!;

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
    count: String(sorted.length),
    round: String(Math.max(...sorted.map((t) => t.played))),
  };

  const cols = texts.standingsColumns;

  return (
    <section
      aria-label={texts.standingsSectionLabel}
      style={{
        padding: "6rem 2rem",
        background: "var(--dark-3)",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <SectionHeader
          label={texts.standingsSectionLabel}
          title={formatTemplate(texts.standingsTitle, templateVars)}
          subtitle={formatTemplate(texts.standingsSubtitle, templateVars)}
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
            {[cols.rank, cols.club, cols.w, cols.d, cols.l, cols.gd, cols.goals, cols.pts].map((h) => (
              <p
                key={h}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#444",
                  textAlign: h === cols.rank || h === cols.club ? "left" : "center",
                }}
              >
                {h}
              </p>
            ))}
          </div>

          {sorted.map((team, i) => {
            const isClub = team.id === club.id;
            const gap = isClub ? null : clubTeam.points - team.points;
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
                  background: isClub ? "var(--club-primary-glow)" : "transparent",
                  position: "relative",
                }}
              >
                {isClub && (
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
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1rem",
                    color: isClub ? "var(--club-primary)" : "#555",
                    fontWeight: isClub ? 700 : 400,
                  }}
                >
                  {i + 1}
                </p>
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1rem",
                      color: isClub ? "#fff" : "#bbb",
                      fontWeight: isClub ? 600 : 400,
                    }}
                  >
                    {team.shortName}
                  </p>
                  {!isClub && gap !== null && (
                    <p style={{ fontSize: "0.7rem", color: "#444" }}>-{gap} {texts.standingsGapSuffix}</p>
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
                    color: isClub ? "var(--club-primary)" : "#fff",
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
