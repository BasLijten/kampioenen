"use client";

import type { ClubConfig } from "@/config/clubs";
import type { LeagueClientConfig } from "@/config/env";
import type { LocaleStrings } from "@/config/locales/nl";
import { formatTemplate } from "@/config/env";

export default function Footer({
  simulatedAt,
  club,
  league,
  texts,
}: {
  simulatedAt: string;
  club: ClubConfig;
  league: LeagueClientConfig;
  texts: LocaleStrings;
}) {
  const date = new Date(simulatedAt).toLocaleString(league.locale, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
    date,
  };

  return (
    <footer
      style={{
        padding: "3rem 2rem",
        background: "var(--dark)",
        borderTop: "1px solid var(--dark-4)",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.7rem",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "#333",
        }}
      >
        {formatTemplate(texts.footerText, templateVars)}
      </p>
      <p
        style={{
          marginTop: "0.5rem",
          fontSize: "0.7rem",
          color: "#2a2a2a",
        }}
      >
        {formatTemplate(texts.footerDisclaimer, templateVars)}
      </p>
    </footer>
  );
}
