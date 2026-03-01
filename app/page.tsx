import { readFileSync } from "fs";
import { join } from "path";
import type { SimulationResult } from "@/lib/simulation";
import type { Team, Fixture } from "@/lib/data";
import HeroSection from "@/components/HeroSection";
import ChampionshipTimeline from "@/components/ChampionshipTimeline";
import BestCaseView from "@/components/BestCaseView";
import StandingsTable from "@/components/StandingsTable";
import Footer from "@/components/Footer";

export interface Explanation {
  psvPoints: number;
  psvPlayed: number;
  psvRemaining: number;
  rivals: Array<{ name: string; points: number; maxPoints: number; gap: number; winAllProb: number }>;
  iterations: number;
  neverChampionCount: number;
}

interface PageData {
  result: SimulationResult;
  explanation: Explanation;
  teams: Team[];
  fixtures: Fixture[];
  fetchedAt: string | null;
  simulatedAt: string;
}

function loadData(): PageData {
  const raw = readFileSync(
    join(process.cwd(), "data/simulation-result.json"),
    "utf-8"
  );
  return JSON.parse(raw) as PageData;
}

function formatDateNL(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
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

function buildFaqJsonLd(result: SimulationResult) {
  const topProb = result.dateProbabilities.reduce((max, dp) =>
    dp.probability > max.probability ? dp : max,
    result.dateProbabilities[0]
  );

  const mostLikelyDate = topProb ? formatDateNL(topProb.date) : "onbekend";
  const bestCaseDate = result.bestCaseDate ? formatDateNL(result.bestCaseDate) : "onbekend";
  const champProb = formatProbability(result.totalChampionshipProbability);

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Wanneer wordt PSV kampioen?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Op basis van een Monte Carlo simulatie met 50.000 scenario's is de meest waarschijnlijke kampioensdatum ${mostLikelyDate}. De vroegst mogelijke datum (best case) is ${bestCaseDate}.`,
        },
      },
      {
        "@type": "Question",
        name: "Hoe groot is de kans dat PSV kampioen wordt?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `De kans dat PSV Eredivisie kampioen wordt is ${champProb}, berekend op basis van 50.000 gesimuleerde seizoensverloop scenario's.`,
        },
      },
      {
        "@type": "Question",
        name: "Wanneer kan PSV op zijn vroegst kampioen worden?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `In het best case scenario — als PSV alle resterende wedstrijden wint — wordt PSV kampioen op ${bestCaseDate}${result.bestCaseRound ? ` (speelronde ${result.bestCaseRound})` : ""}.`,
        },
      },
    ],
  };
}

export default function Home() {
  const { result, explanation, teams, fixtures, fetchedAt, simulatedAt } = loadData();
  const faqJsonLd = buildFaqJsonLd(result);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HeroSection result={result} explanation={explanation} fetchedAt={fetchedAt} simulatedAt={simulatedAt} />
      <BestCaseView
        bestCaseDate={result.bestCaseDate}
        bestCaseRound={result.bestCaseRound}
        teams={teams}
        fixtures={fixtures}
      />
      <ChampionshipTimeline dates={result.dateProbabilities} />
      <StandingsTable teams={teams} />
      <Footer simulatedAt={simulatedAt} />
    </main>
  );
}
