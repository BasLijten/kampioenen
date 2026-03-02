import type { LocaleStrings } from "./locales/nl";
import { nl } from "./locales/nl";
import { en } from "./locales/en";

const locales: Record<string, LocaleStrings> = { nl, en };

export interface ClubConfig {
  id: string;
  leagueId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  primaryColorDeep: string;
  primaryColorGlow: string;
  domain: string;
  kofiUrl?: string;
  locale: string;
  coordinates: { latitude: number; longitude: number };
  textOverrides?: Partial<LocaleStrings>;
}

export function getClubTexts(club: ClubConfig): LocaleStrings {
  const base = locales[club.locale] ?? nl;
  if (!club.textOverrides) return base;
  return { ...base, ...club.textOverrides };
}

export const clubs: Record<string, ClubConfig> = {
  psv: {
    id: "psv",
    leagueId: "eredivisie",
    name: "PSV Eindhoven",
    shortName: "PSV",
    primaryColor: "#E8001C",
    primaryColorDeep: "#b0001a",
    primaryColorGlow: "rgba(232,0,28,0.25)",
    domain: "psvkampioen.nl",
    kofiUrl: "https://ko-fi.com/baslijten",
    locale: "nl",
    coordinates: { latitude: 51.4416, longitude: 5.4697 },
  },
  ajax: {
    id: "ajax",
    leagueId: "eredivisie",
    name: "Ajax",
    shortName: "Ajax",
    primaryColor: "#D2122E",
    primaryColorDeep: "#a00e24",
    primaryColorGlow: "rgba(210,18,46,0.25)",
    domain: "ajaxkampioen.nl",
    locale: "nl",
    coordinates: { latitude: 52.3676, longitude: 4.9041 },
  },
  feyenoord: {
    id: "feyenoord",
    leagueId: "eredivisie",
    name: "Feyenoord",
    shortName: "Feyenoord",
    primaryColor: "#EE1C25",
    primaryColorDeep: "#b5141c",
    primaryColorGlow: "rgba(238,28,37,0.25)",
    domain: "feyenoordkampioen.nl",
    locale: "nl",
    coordinates: { latitude: 51.9244, longitude: 4.4777 },
  },
};
