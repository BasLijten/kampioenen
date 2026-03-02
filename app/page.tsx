import { readFileSync } from "fs";
import { join } from "path";
import type { ClubSimulationResult, DateProbability } from "@/lib/simulation";
import type { Team, Fixture } from "@/lib/data";
import { resolveConfig, formatTemplate, toClientLeague } from "@/config/env";
import HeroSection from "@/components/HeroSection";
import ChampionshipTimeline from "@/components/ChampionshipTimeline";
import BestCaseView from "@/components/BestCaseView";
import EndOfSeasonPrediction from "@/components/EndOfSeasonPrediction";
import Footer from "@/components/Footer";

export interface Explanation {
  clubPoints: number;
  clubPlayed: number;
  clubRemaining: number;
  rivals: Array<{ name: string; points: number; maxPoints: number; gap: number; winAllProb: number }>;
  iterations: number;
  neverChampionCount: number;
}

interface PageData {
  clubResults: Record<string, ClubSimulationResult>;
  iterations: number;
  explanation: Record<string, Explanation>;
  teams: Team[];
  fixtures: Fixture[];
  fetchedAt: string | null;
  simulatedAt: string;
}

const { league: leagueFull, club, texts } = resolveConfig();
const league = toClientLeague(leagueFull);

function loadData(): PageData {
  const raw = readFileSync(
    join(process.cwd(), `data/${league.id}/simulation-results.json`),
    "utf-8"
  );
  return JSON.parse(raw) as PageData;
}

function formatDateLocale(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(league.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatProbability(prob: number): string {
  const pct = prob * 100;
  if (pct >= 99.995) return ">99,99%";
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

function buildFaqJsonLd(result: ClubSimulationResult) {
  const topProb = result.dateProbabilities.reduce((max, dp) =>
    dp.probability > max.probability ? dp : max,
    result.dateProbabilities[0]
  );

  const mostLikelyDate = topProb ? formatDateLocale(topProb.date) : "onbekend";
  const bestCaseDate = result.bestCaseDate ? formatDateLocale(result.bestCaseDate) : "onbekend";
  const champProb = formatProbability(result.totalChampionshipProbability);

  const templateVars = {
    clubName: club.name,
    clubShortName: club.shortName,
    leagueName: league.name,
    season: league.season,
    mostLikelyDate,
    bestCaseDate,
    probability: champProb,
    roundSuffix: result.bestCaseRound ? ` (${texts.timelineRound.toLowerCase()} ${result.bestCaseRound})` : "",
  };

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: formatTemplate(texts.faqWhenChampion, templateVars),
        acceptedAnswer: {
          "@type": "Answer",
          text: formatTemplate(texts.faqWhenChampionAnswer, templateVars),
        },
      },
      {
        "@type": "Question",
        name: formatTemplate(texts.faqChanceChampion, templateVars),
        acceptedAnswer: {
          "@type": "Answer",
          text: formatTemplate(texts.faqChanceChampionAnswer, templateVars),
        },
      },
      {
        "@type": "Question",
        name: formatTemplate(texts.faqEarliestChampion, templateVars),
        acceptedAnswer: {
          "@type": "Answer",
          text: formatTemplate(texts.faqEarliestChampionAnswer, templateVars),
        },
      },
    ],
  };
}

export default function Home() {
  const data = loadData();
  const result = data.clubResults[club.id];
  const explanation = data.explanation[club.id];
  const { teams, fixtures, fetchedAt, simulatedAt } = data;

  const faqJsonLd = buildFaqJsonLd(result);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HeroSection
        result={result}
        explanation={explanation}
        fetchedAt={fetchedAt}
        simulatedAt={simulatedAt}
        club={club}
        league={league}
        texts={texts}
      />
      <BestCaseView
        bestCaseDate={result.bestCaseDate}
        bestCaseRound={result.bestCaseRound}
        teams={teams}
        fixtures={fixtures}
        club={club}
        league={league}
        texts={texts}
      />
      <ChampionshipTimeline
        dates={result.dateProbabilities}
        club={club}
        league={league}
        texts={texts}
        teams={teams}
      />
      <EndOfSeasonPrediction
        clubResults={data.clubResults}
        teams={teams}
        club={club}
        league={league}
        texts={texts}
      />
      <Footer
        simulatedAt={simulatedAt}
        club={club}
        league={league}
        texts={texts}
      />
    </main>
  );
}
