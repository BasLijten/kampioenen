# Copilot Instructions for `kampioenen`

## Build, lint, and data commands

- `npm run dev` — start local Next.js dev server.
- `npm run build` — runs `prebuild` first (`tsx scripts/simulate.ts`), then `next build`.
- `npm run start` — serve production build.
- `npm run lint` — run ESLint (Next.js core-web-vitals + TypeScript config).
- `npm run fetch-data` — fetch live Eredivisie standings/fixtures/predictions into `data/eredivisie.json`.
- `npm run simulate` — run Monte Carlo simulation and write `data/simulation-result.json`.
- `npm run update-data` — fetch live data, then simulate.

### Tests

- There is currently no automated test script configured in `package.json`.
- Single-test command is therefore not available in this repository today.

## High-level architecture

The app is built as a static-data pipeline:

1. `scripts/fetch-data.ts` (optional) calls API-Football and transforms raw API payloads into internal shapes (`lib/transform.ts`), writing `data/eredivisie.json`.
2. `scripts/simulate.ts` reads `data/eredivisie.json` (or falls back to `lib/data.ts` when missing), runs Monte Carlo logic in `lib/simulation.ts`, then writes `data/simulation-result.json`.
3. `app/page.tsx` is a Server Component that synchronously reads `data/simulation-result.json` at build/runtime and passes typed data into UI components.

Core modeling details:

- Match probabilities come from **exactly one source per fixture**: API predictions (`source: "api"`) or Poisson fallback (`source: "poisson"`).
- Poisson math lives in `lib/poisson.ts` (team strengths + expected goals + score matrix up to `MAX_GOALS`).
- Championship probability output includes timeline (`dateProbabilities`), best-case round/date, expected date, and never-champion probability.

## Key repository conventions

- Internal team identity uses stable lowercase ids (`psv`, `ajax`, etc.); keep API-name mapping centralized in `TEAM_ID_MAP` (`lib/transform.ts`).
- `scripts/fetch-data.ts` manually loads `.env.local`; if you change data scripts, preserve this behavior because `tsx` does not get Next.js env loading automatically.
- Build behavior depends on generated JSON: `prebuild` always re-runs simulation before `next build`.
- UI copy/date formatting is Dutch-first (`nl-NL`, Dutch labels/text) and should stay consistent.
- `@/*` path alias is enabled in `tsconfig.json`; prefer alias imports over deep relative paths in app/component code.
- Standings UI intentionally shows top 6 (`StandingsTable` slices sorted teams), while simulation/data flow supports full league input.
