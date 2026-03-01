/**
 * npm run simulate
 *
 * Leest data/eredivisie.json, voert de Monte Carlo simulatie uit (50.000
 * iteraties) en slaat het resultaat op als data/simulation-result.json.
 *
 * Als data/eredivisie.json niet bestaat, wordt de ingebakken static data
 * uit lib/data.ts als fallback gebruikt zodat `npm run build` altijd werkt.
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { runSimulation } from "../lib/simulation";
import { teams as staticTeams, remainingFixtures as staticFixtures, Team, Fixture } from "../lib/data";

const ITERATIONS = 50_000;

function loadEredivisieData(): { teams: Team[]; fixtures: Fixture[]; fetchedAt: string | null } {
  try {
    const raw = readFileSync(join(process.cwd(), "data/eredivisie.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      teams: parsed.teams as Team[],
      fixtures: parsed.remainingFixtures as Fixture[],
      fetchedAt: parsed.fetchedAt ?? null,
    };
  } catch {
    console.warn("⚠️   data/eredivisie.json niet gevonden — static data wordt gebruikt als fallback");
    console.warn("     Draai `npm run fetch-data` voor live data.");
    return { teams: staticTeams, fixtures: staticFixtures, fetchedAt: null };
  }
}

function main() {
  const { teams, fixtures, fetchedAt } = loadEredivisieData();

  console.log(`🎲  Monte Carlo simulatie (${ITERATIONS.toLocaleString()} iteraties)...`);
  console.log(`   ${teams.length} teams, ${fixtures.length} resterende wedstrijden`);
  if (fetchedAt) {
    console.log(`   Data van: ${new Date(fetchedAt).toLocaleString("nl-NL")}`);
  }

  const start = Date.now();
  const result = runSimulation(ITERATIONS, teams, fixtures);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`   Klaar in ${elapsed}s — PSV kampioen in ${(result.totalChampionshipProbability * 100).toFixed(1)}% van de scenario's`);

  // Build explanation context
  const psv = teams.find((t) => t.id === "psv")!;
  const psvRemaining = 34 - psv.played;
  const rivals = teams
    .filter((t) => t.id !== "psv")
    .map((t) => {
      const teamFixtures = fixtures.filter(
        (f) => f.homeTeam === t.id || f.awayTeam === t.id
      );
      const winAllProb = teamFixtures.reduce((p, f) => {
        const winProb = f.homeTeam === t.id ? f.homeWinProb : f.awayWinProb;
        return p * winProb;
      }, 1);
      return {
        name: t.name,
        points: t.points,
        maxPoints: t.points + (34 - t.played) * 3,
        gap: psv.points - t.points,
        winAllProb,
      };
    })
    .sort((a, b) => b.maxPoints - a.maxPoints)
    .slice(0, 5);

  const explanation = {
    psvPoints: psv.points,
    psvPlayed: psv.played,
    psvRemaining,
    rivals,
    iterations: result.iterations,
    neverChampionCount: result.neverChampionCount,
  };

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const output = {
    result,
    explanation,
    teams,
    fixtures,
    fetchedAt,
    simulatedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(process.cwd(), "data/simulation-result.json"),
    JSON.stringify(output, null, 2)
  );
  console.log("✅  data/simulation-result.json opgeslagen");
}

main();
