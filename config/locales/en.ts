import type { LocaleStrings } from "./nl";

export const en: LocaleStrings = {
  // Hero
  heroSubtitle: "{leagueName} {season} \u00a0\u00b7\u00a0 Season Simulation",
  heroDescription: "Monte Carlo simulation based on 50,000 scenarios. When and how likely will {clubName} become champion?",
  statChampionshipChance: "Championship Probability",
  statBestCase: "Best Case Scenario",
  statMostLikely: "Most Likely",
  explanationButton: "How is this calculated?",
  explanationButtonClose: "Close",
  explanationTitle: "How is this calculated?",
  explanationPointsAfter: "{clubName} has <strong>{points} points</strong> after <strong>{played}</strong> matches (<strong>{remaining}</strong> remaining).",
  explanationRemaining: "remaining",
  explanationRivalsLabel: "Competitors \u2014 maximum achievable points",
  explanationRivalsColumns: { team: "Team", points: "Points", max: "Max", gap: "Gap", winAll: "Win all" },
  explanationSimRan: "The simulation ran <strong>{iterations}</strong> scenarios.",
  explanationBecameChampion: "In <strong>{count}</strong> of those, {clubName} became champion",
  explanationDidNot: "(in <strong>{count}</strong> they did not)",
  explanationBestCaseDesc: "<strong>Best Case Scenario</strong> is the earliest possible championship date: the round in which {clubName} is mathematically champion if they win all remaining matches and competitors achieve expected results.",
  explanationMostLikelyDesc: "<strong>Most Likely</strong> is the date with the highest probability in the simulation \u2014 the peak of the probability distribution.",
  explanationBestCaseMostLikelySame: "That these two fall on the same date makes sense: {clubName}'s lead is so large that in most simulations the championship is already decided in the earliest possible round.",
  explanationPredictionSource: "Match probabilities come from API-Football predictions. When predictions are missing, a Poisson model based on league standings is used.",
  heroCallToAction: "So make sure you take the next day off!",
  donateButton: "Like this? Buy me a beer at the championship celebration!",
  scrollLabel: "Scroll",

  // Best Case
  bestCaseSectionLabel: "Best Case Scenario",
  bestCaseTitle: "If {clubName} wins everything...",
  bestCaseSubtitle: "{clubName} becomes champion on {date} in round {round}",
  bestCaseHighlightLabel: "Earliest possible championship date",
  bestCaseHighlightRound: "Round {round} \u00b7 If {clubName} wins all remaining matches",
  bestCaseColumnRound: "Round",
  bestCaseColumnMatch: "Match",
  bestCaseColumnResult: "Result",
  bestCaseColumnPoints: "Points",
  bestCaseWin: "Win (+3)",
  bestCaseHome: "Home",
  bestCaseAway: "Away",
  bestCaseChampionBadge: "Champion",

  // Timeline
  timelineSectionLabel: "Date Distribution",
  timelineTitle: "When will {clubName} become champion?",
  timelineSubtitle: "Per matchday: probability that {clubName} clinches the title on that date",
  timelineMostLikely: "Most likely",
  timelineFootnote: "Dates only show probabilities above 0.1%. Simulation based on 50,000 iterations.",
  timelineRound: "Round",
  timelineVs: "vs",
  timelineAt: "@",
  timelineFreeRound: "Free",

  // Standings
  standingsSectionLabel: "Current Standings",
  standingsTitle: "{leagueName} Top {count}",
  standingsSubtitle: "Standings after matchday {round}",
  standingsColumns: { rank: "#", club: "Club", w: "W", d: "D", l: "L", gd: "GD", goals: "Goals", pts: "Pts" },
  standingsGapSuffix: "pts",

  // End of season prediction
  predictionSectionLabel: "End of Season Prediction",
  predictionTitle: "{leagueName} final standings prediction",
  predictionSubtitle: "Based on 50,000 simulations — probability per club per final position",
  predictionFootnote: "Percentages show the probability of finishing at that position. Values below 0.5% are hidden. Simulation based on 50,000 iterations.",

  // Footer
  footerText: "{clubShortName} Champion Countdown \u00b7 Monte Carlo simulation \u00b7 50,000 iterations",
  footerDisclaimer: "Probabilities are indicative \u00b7 Generated on {date}",

  // SEO / FAQ
  faqWhenChampion: "When will {clubName} become champion?",
  faqWhenChampionAnswer: "Based on a Monte Carlo simulation with 50,000 scenarios, the most likely championship date is {mostLikelyDate}. The earliest possible date (best case) is {bestCaseDate}.",
  faqChanceChampion: "What are the chances {clubName} becomes champion?",
  faqChanceChampionAnswer: "The probability that {clubName} wins the {leagueName} is {probability}, calculated based on 50,000 simulated season scenarios.",
  faqEarliestChampion: "When is the earliest {clubName} can become champion?",
  faqEarliestChampionAnswer: "In the best case scenario \u2014 if {clubName} wins all remaining matches \u2014 {clubName} becomes champion on {bestCaseDate}{roundSuffix}.",

  // Weather
  weatherExpected: "expected",

  // Meta
  metaTitleTemplate: "{clubShortName} Champion {season} \u2014 When will {clubShortName} win the {leagueName}?",
  metaDescriptionTemplate: "Monte Carlo simulation with 50,000 scenarios calculates when {clubName} will win the {leagueName} {season}. View probabilities per matchday, best case scenario and current standings.",
  ogTitleTemplate: "{clubShortName} Champion {season} \u2014 When will {clubShortName} win the {leagueName}?",
  ogDescriptionTemplate: "Monte Carlo simulation with 50,000 scenarios calculates when {clubShortName} becomes champion. Probabilities per matchday, best case scenario and live standings.",
  schemaName: "{clubShortName} Champion {season}",
  schemaDescription: "Monte Carlo simulation calculates when {clubName} will win the {leagueName} {season}.",
};
