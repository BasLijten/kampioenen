/**
 * npm run simulate
 *
 * Leest data/{league}/standings.json, voert de Monte Carlo simulatie uit
 * (50.000 iteraties) en slaat het resultaat op als data/{league}/simulation-results.json.
 *
 * Als het standings bestand niet bestaat en de league is eredivisie, wordt de
 * ingebakken fallback data gebruikt zodat `npm run build` altijd werkt.
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { runSimulation } from "../lib/simulation";
import { Team, Fixture } from "../lib/data";
import { resolveLeague } from "../config/env";

const ITERATIONS = 50_000;

function loadLeagueData(dataDir: string, leagueId: string): { teams: Team[]; fixtures: Fixture[]; fetchedAt: string | null } {
  try {
    const raw = readFileSync(join(process.cwd(), dataDir, "standings.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      teams: parsed.teams as Team[],
      fixtures: parsed.remainingFixtures as Fixture[],
      fetchedAt: parsed.fetchedAt ?? null,
    };
  } catch {
    if (leagueId === "eredivisie") {
      console.warn("standings.json niet gevonden -- eredivisie fallback data wordt gebruikt");
      console.warn("     Draai `npm run fetch-data` voor live data.");
      // Dynamic import to avoid bundling fallback when not needed
      const { fallbackTeams, fallbackFixtures } = require("../config/fallback/eredivisie");
      return { teams: fallbackTeams, fixtures: fallbackFixtures, fetchedAt: null };
    }
    throw new Error(`${dataDir}/standings.json niet gevonden. Draai eerst \`npm run fetch-data\`.`);
  }
}

function main() {
  const league = resolveLeague();
  const { teams, fixtures, fetchedAt } = loadLeagueData(league.dataDir, league.id);

  console.log(`League: ${league.name} (${league.id})`);
  console.log(`Monte Carlo simulatie (${ITERATIONS.toLocaleString()} iteraties)...`);
  console.log(`   ${teams.length} teams, ${fixtures.length} resterende wedstrijden`);
  if (fetchedAt) {
    console.log(`   Data van: ${new Date(fetchedAt).toLocaleString(league.locale)}`);
  }

  const start = Date.now();
  const result = runSimulation(ITERATIONS, teams, fixtures, league.totalRounds);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Show top clubs' championship probabilities
  const sorted = Object.values(result.clubResults)
    .sort((a, b) => b.totalChampionshipProbability - a.totalChampionshipProbability);

  console.log(`   Klaar in ${elapsed}s`);
  console.log("   Top clubs:");
  for (const club of sorted.slice(0, 6)) {
    if (club.totalChampionshipProbability > 0) {
      console.log(`     ${club.teamName}: ${(club.totalChampionshipProbability * 100).toFixed(1)}%`);
    }
  }

  // Build explanation per club (top contenders)
  const explanation: Record<string, object> = {};
  for (const club of sorted) {
    if (club.totalChampionshipProbability <= 0) continue;

    const team = teams.find((t) => t.id === club.teamId)!;
    const remaining = league.totalRounds - team.played;
    const rivals = teams
      .filter((t) => t.id !== club.teamId)
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
          maxPoints: t.points + (league.totalRounds - t.played) * 3,
          gap: team.points - t.points,
          winAllProb,
        };
      })
      .sort((a, b) => b.maxPoints - a.maxPoints)
      .slice(0, 5);

    explanation[club.teamId] = {
      clubPoints: team.points,
      clubPlayed: team.played,
      clubRemaining: remaining,
      rivals,
      iterations: result.iterations,
      neverChampionCount: club.neverChampionCount,
    };
  }

  const dataDir = join(process.cwd(), league.dataDir);
  mkdirSync(dataDir, { recursive: true });
  const output = {
    clubResults: result.clubResults,
    iterations: result.iterations,
    explanation,
    teams,
    fixtures,
    fetchedAt,
    simulatedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(dataDir, "simulation-results.json"),
    JSON.stringify(output, null, 2)
  );
  console.log(`${league.dataDir}/simulation-results.json opgeslagen`);
}

main();
