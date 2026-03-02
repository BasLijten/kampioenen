export interface LocaleStrings {
  // Hero
  heroSubtitle: string;
  heroDescription: string;
  statChampionshipChance: string;
  statBestCase: string;
  statMostLikely: string;
  explanationButton: string;
  explanationButtonClose: string;
  explanationTitle: string;
  explanationPointsAfter: string;
  explanationRemaining: string;
  explanationRivalsLabel: string;
  explanationRivalsColumns: { team: string; points: string; max: string; gap: string; winAll: string };
  explanationSimRan: string;
  explanationBecameChampion: string;
  explanationDidNot: string;
  explanationBestCaseDesc: string;
  explanationMostLikelyDesc: string;
  explanationBestCaseMostLikelySame: string;
  explanationPredictionSource: string;
  heroCallToAction: string;
  donateButton: string;
  scrollLabel: string;

  // Best Case
  bestCaseSectionLabel: string;
  bestCaseTitle: string;
  bestCaseSubtitle: string;
  bestCaseHighlightLabel: string;
  bestCaseHighlightRound: string;
  bestCaseColumnRound: string;
  bestCaseColumnMatch: string;
  bestCaseColumnResult: string;
  bestCaseColumnPoints: string;
  bestCaseWin: string;
  bestCaseHome: string;
  bestCaseAway: string;
  bestCaseChampionBadge: string;

  // Timeline
  timelineSectionLabel: string;
  timelineTitle: string;
  timelineSubtitle: string;
  timelineMostLikely: string;
  timelineFootnote: string;
  timelineRound: string;
  timelineVs: string;
  timelineAt: string;
  timelineFreeRound: string;

  // Standings
  standingsSectionLabel: string;
  standingsTitle: string;
  standingsSubtitle: string;
  standingsColumns: { rank: string; club: string; w: string; d: string; l: string; gd: string; goals: string; pts: string };
  standingsGapSuffix: string;

  // End of season prediction
  predictionSectionLabel: string;
  predictionTitle: string;
  predictionSubtitle: string;
  predictionFootnote: string;

  // Footer
  footerText: string;
  footerDisclaimer: string;

  // SEO / FAQ
  faqWhenChampion: string;
  faqWhenChampionAnswer: string;
  faqChanceChampion: string;
  faqChanceChampionAnswer: string;
  faqEarliestChampion: string;
  faqEarliestChampionAnswer: string;

  // Weather
  weatherExpected: string;

  // Meta
  metaTitleTemplate: string;
  metaDescriptionTemplate: string;
  ogTitleTemplate: string;
  ogDescriptionTemplate: string;
  schemaName: string;
  schemaDescription: string;
}

export const nl: LocaleStrings = {
  // Hero
  heroSubtitle: "{leagueName} {season} \u00a0\u00b7\u00a0 Seizoen Simulatie",
  heroDescription: "Monte Carlo simulatie op basis van 50.000 scenario's. Wanneer en hoe waarschijnlijk wordt {clubName} kampioen?",
  statChampionshipChance: "Kans op Kampioenschap",
  statBestCase: "Best Case Scenario",
  statMostLikely: "Meest Waarschijnlijk",
  explanationButton: "Hoe is dit berekend?",
  explanationButtonClose: "Sluiten",
  explanationTitle: "Hoe is dit berekend?",
  explanationPointsAfter: "{clubName} staat op <strong>{points} punten</strong> na <strong>{played}</strong> wedstrijden (nog <strong>{remaining}</strong> te spelen).",
  explanationRemaining: "te spelen",
  explanationRivalsLabel: "Concurrenten \u2014 maximaal haalbare punten",
  explanationRivalsColumns: { team: "Team", points: "Punten", max: "Max", gap: "Achterstand", winAll: "Pakt max" },
  explanationSimRan: "De simulatie draaide <strong>{iterations}</strong> scenario's.",
  explanationBecameChampion: "In <strong>{count}</strong> daarvan werd {clubName} kampioen",
  explanationDidNot: "(in <strong>{count}</strong> niet)",
  explanationBestCaseDesc: "<strong>Best Case Scenario</strong> is de vroegst mogelijke kampioensdatum: de ronde waarin {clubName} wiskundig kampioen is als ze alle resterende wedstrijden winnen en concurrenten de verwachte resultaten behalen.",
  explanationMostLikelyDesc: "<strong>Meest Waarschijnlijk</strong> is de datum met de hoogste kans in de simulatie \u2014 de piek van de kansverdeling.",
  explanationBestCaseMostLikelySame: "Dat deze twee op dezelfde datum vallen is logisch: de voorsprong van {clubName} is zo groot dat in de meeste simulaties het kampioenschap al in de vroegst mogelijke ronde wordt beslist.",
  explanationPredictionSource: "Wedstrijdkansen komen van API-Football predictions. Bij ontbrekende predictions wordt een Poisson-model gebruikt op basis van de competitiestand.",
  heroCallToAction: "Zorg er dus voor dat je de dag erna vrij hebt!",
  donateButton: "Vind je dit leuk? Koop een biertje voor mij op het kampioenschap!",
  scrollLabel: "Scroll",

  // Best Case
  bestCaseSectionLabel: "Best Case Scenario",
  bestCaseTitle: "Als {clubName} alles wint...",
  bestCaseSubtitle: "{clubName} wordt kampioen op {date} in ronde {round}",
  bestCaseHighlightLabel: "Vroegst mogelijke kampioensdatum",
  bestCaseHighlightRound: "Ronde {round} \u00b7 Als {clubName} alle resterende wedstrijden wint",
  bestCaseColumnRound: "Ronde",
  bestCaseColumnMatch: "Wedstrijd",
  bestCaseColumnResult: "Resultaat",
  bestCaseColumnPoints: "Punten",
  bestCaseWin: "Winst (+3)",
  bestCaseHome: "Thuis",
  bestCaseAway: "Uit",
  bestCaseChampionBadge: "Kampioen",

  // Timeline
  timelineSectionLabel: "Datum Verdeling",
  timelineTitle: "Wanneer wordt {clubName} kampioen?",
  timelineSubtitle: "Per speelronde: kans dat {clubName} op die datum het kampioenschap veiligstelt",
  timelineMostLikely: "Meest likely",
  timelineFootnote: "Datums tonen alleen kansen boven 0.1%. Simulatie op basis van 50.000 iteraties.",
  timelineRound: "Ronde",
  timelineVs: "vs",
  timelineAt: "@",
  timelineFreeRound: "Vrij",

  // Standings
  standingsSectionLabel: "Huidige Stand",
  standingsTitle: "{leagueName} Top {count}",
  standingsSubtitle: "Stand per speelronde {round}",
  standingsColumns: { rank: "#", club: "Club", w: "W", d: "G", l: "V", gd: "Gsr", goals: "Doel", pts: "Pnt" },
  standingsGapSuffix: "pnt",

  // End of season prediction
  predictionSectionLabel: "Eindstand Voorspelling",
  predictionTitle: "{leagueName} eindstand voorspelling",
  predictionSubtitle: "Op basis van 50.000 simulaties — kans per club per eindpositie",
  predictionFootnote: "Percentages tonen de kans op die eindpositie. Waarden onder 0,5% zijn verborgen. Simulatie op basis van 50.000 iteraties.",

  // Footer
  footerText: "{clubShortName} Kampioen Countdown \u00b7 Monte Carlo simulatie \u00b7 50.000 iteraties",
  footerDisclaimer: "Kansen zijn indicatief \u00b7 Gegenereerd op {date}",

  // SEO / FAQ
  faqWhenChampion: "Wanneer wordt {clubName} kampioen?",
  faqWhenChampionAnswer: "Op basis van een Monte Carlo simulatie met 50.000 scenario's is de meest waarschijnlijke kampioensdatum {mostLikelyDate}. De vroegst mogelijke datum (best case) is {bestCaseDate}.",
  faqChanceChampion: "Hoe groot is de kans dat {clubName} kampioen wordt?",
  faqChanceChampionAnswer: "De kans dat {clubName} {leagueName} kampioen wordt is {probability}, berekend op basis van 50.000 gesimuleerde seizoensverloop scenario's.",
  faqEarliestChampion: "Wanneer kan {clubName} op zijn vroegst kampioen worden?",
  faqEarliestChampionAnswer: "In het best case scenario \u2014 als {clubName} alle resterende wedstrijden wint \u2014 wordt {clubName} kampioen op {bestCaseDate}{roundSuffix}.",

  // Weather
  weatherExpected: "verwacht",

  // Meta
  metaTitleTemplate: "{clubShortName} Kampioen {season} \u2014 Wanneer wordt {clubShortName} {leagueName} kampioen?",
  metaDescriptionTemplate: "Monte Carlo simulatie met 50.000 scenario's berekent wanneer {clubName} {leagueName} kampioen {season} wordt. Bekijk kansen per speelronde, best case scenario en de huidige stand.",
  ogTitleTemplate: "{clubShortName} Kampioen {season} \u2014 Wanneer wordt {clubShortName} {leagueName} kampioen?",
  ogDescriptionTemplate: "Monte Carlo simulatie met 50.000 scenario's berekent wanneer {clubShortName} kampioen wordt. Kansen per speelronde, best case scenario en live stand.",
  schemaName: "{clubShortName} Kampioen {season}",
  schemaDescription: "Monte Carlo simulatie berekent wanneer {clubName} {leagueName} kampioen {season} wordt.",
};
