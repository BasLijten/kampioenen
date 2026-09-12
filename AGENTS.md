# AGENTS.md — Repository Instructions

## Delivery

Every addition—feature, fix, refactor, dependency, configuration, documentation, or generated-data change—belongs to its own dedicated branch and new pull request.

At the start of a task:

1. Inspect the worktree and current branch with `git status --short --branch`.
2. If the branch is `main`, create or switch to a task branch before editing.
3. Keep `main` protected. The only completion path is a reviewed pull request merged into `main`.

Preserve unrelated work already present in the worktree. Keep each change focused and follow the existing TypeScript, React, and Tailwind patterns.

## Verification

For changes limited to documentation or skills—such as `AGENTS.md`, `README.md`, `docs/**`, or `.agents/skills/**`—review the content, formatting, and links only. These changes require no rebuild, generated-data update, or new deployment.

When a PR mixes documentation or skills with code, configuration, or generated data, use the code-change path below and allow the normal deployment process.

For code changes:

1. Add or update tests with the implementation.
2. Run `npm run lint`.
3. Run `npm run test:run` and resolve every failure.
4. Run `npm run build` when the change affects pages, build-time data, configuration, or generated output.

The work is ready for review only when the intended diff is understood, required checks pass, and the branch is ready for its pull request.

## Simulation tests

Tests use Vitest and live in `__tests__/<module>.test.ts`.

- Cover every logical path for best-case results: early clinch, late clinch, and null/eliminated.
- Cover every logical path for most-likely results: certainty win, certainty loss, and `expectedDate`.
- Give every new simulation output field a happy-path test and a null, zero, or boundary test.
- Give every new helper in `lib/` a test for each distinct behavior.
- Make Monte Carlo tests deterministic with extreme probabilities: `(homeWinProb=1, drawProb=0)` for a home win, `(0, 1)` for a draw, and `(0, 0)` for an away win. Use 100–500 iterations and keep the best-case calculation deterministic without mocking randomness.

## Repository facts

- The application is a Next.js / React / TypeScript static site styled with Tailwind CSS.
- Runtime API calls are not part of the site; standings, fixtures, weather, and simulation results are prepared by scripts at build time.
- `package.json` is the source of truth for available commands and dependencies. `README.md` is the source of truth for general setup.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.
