import { readFileSync } from "fs";
import { join } from "path";
import type { SimulationResult } from "@/lib/simulation";
import type { Team, Fixture } from "@/lib/data";
import HeroSection from "@/components/HeroSection";
import ChampionshipTimeline from "@/components/ChampionshipTimeline";
import BestCaseView from "@/components/BestCaseView";
import StandingsTable from "@/components/StandingsTable";
import Footer from "@/components/Footer";

interface PageData {
  result: SimulationResult;
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

export default function Home() {
  const { result, teams, fixtures, fetchedAt, simulatedAt } = loadData();

  return (
    <main>
      <HeroSection result={result} fetchedAt={fetchedAt} simulatedAt={simulatedAt} />
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
