/**
 * npm run build-all
 *
 * Iterates over all configured clubs, sets TARGET_LEAGUE and TARGET_CLUB
 * for each, and runs `next build` sequentially.
 */

import { execSync } from "child_process";
import { clubs } from "../config/clubs";
import { leagues } from "../config/leagues";

function main() {
  const clubEntries = Object.values(clubs);
  console.log(`Building ${clubEntries.length} club sites...\n`);

  for (const club of clubEntries) {
    const league = leagues[club.leagueId];
    if (!league) {
      console.error(`Unknown league "${club.leagueId}" for club "${club.id}", skipping.`);
      continue;
    }

    console.log(`\n--- Building ${club.name} (${league.name}) ---`);

    const env = {
      ...process.env,
      TARGET_LEAGUE: league.id,
      TARGET_CLUB: club.id,
    };

    try {
      // Run simulate first (prebuild), then build
      execSync("npx next build", {
        env,
        stdio: "inherit",
        cwd: process.cwd(),
      });
      console.log(`${club.shortName} build complete.`);
    } catch (err) {
      console.error(`${club.shortName} build FAILED.`);
      process.exit(1);
    }
  }

  console.log(`\nAll ${clubEntries.length} builds complete.`);
}

main();
