# CLAUDE.md — Project Instructions

## Testing requirements (mandatory)

- **Every new feature or change to simulation logic MUST include tests.**
- Tests live in `__tests__/` and follow the pattern `<module>.test.ts`.
- **Before marking any feature as complete, you MUST run `npm run test:run` and confirm all tests pass.** Do not consider the work done until this command exits with no failures.
- If a test fails, fix the code (or the test if the expected behaviour changed) before finishing.

### Test framework
- **Vitest** (`vitest.config.ts` at project root).
- No extra setup file needed — import directly from `vitest`.

### What to test
| Area | Required coverage |
|------|-------------------|
| Best case scenario | At least one test per logical path (early clinch, late clinch, null/eliminated) |
| Most likely scenario | At least one test per logical path (certainty win, certainty loss, expectedDate value) |
| Any new simulation output field | One happy-path test + one edge-case (null/zero/boundary) |
| Any new helper function in `lib/` | One test per distinct behaviour |

### How to write deterministic simulation tests
The Monte Carlo engine uses `Math.random()`. Avoid mocking — instead, use extreme probability values:
- `homeWinProb=1, drawProb=0` → home team **always** wins (deterministic).
- `homeWinProb=0, drawProb=1` → match **always** draws (deterministic).
- `homeWinProb=0, drawProb=0` → away team **always** wins (deterministic).

The best-case calculation (`bestCaseDate`, `bestCaseRound`) is fully deterministic regardless — no special setup needed.

Use low iteration counts (100–500) in tests to keep them fast.

### Example test structure
```typescript
import { describe, it, expect } from "vitest";
import { runSimulation } from "../lib/simulation";

describe("Best case scenario", () => {
  it("clinches in first round when lead is insurmountable", () => {
    // arrange — minimal teams + fixtures with deterministic probs
    // act
    const result = runSimulation(100, teams, fixtures, 34);
    // assert
    expect(result.clubResults["psv"].bestCaseRound).toBe(29);
  });
});
```

## Stack
- Next.js 16 / React 19 / TypeScript / Tailwind CSS v4
- Static site — no runtime API calls; data pre-built via `npm run update-data`
- All simulation runs at build time (`prebuild` script)

## npm scripts
| Script | Purpose |
|--------|---------|
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run all tests once (CI / pre-commit) |
| `npm run fetch-data` | Pull live standings + fixtures from API-Football |
| `npm run simulate` | Re-run Monte Carlo → `data/simulation-result.json` |
| `npm run update-data` | fetch-data + simulate + fetch-weather |
| `npm run build` | Triggers `prebuild` (simulate) then Next.js build |
