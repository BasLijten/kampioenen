# Vercel application builds

The repository-level [`vercel.json`](../../vercel.json) is the shared Vercel
Ignore Build Step configuration for these Projects:

- `kampioenen`
- `kampioenen-ajax`
- `kampioenen-feyenoord`

All three Projects use the repository root and invoke the same
`bash scripts/ignore-build-step.sh` command. The gate compares Vercel's
previous successful deployment revision with the current revision.
The decision is evaluated independently for each Project, using that
Project's deployment history.

## Documentation-only changes

The application build is skipped only when every changed path is in this
exact allowlist:

- the root `AGENTS.md`
- the root `README.md`
- `docs/**`
- `.agents/skills/**`

Nested `AGENTS.md` and `README.md` files are not included by the two root-file
entries above.

Everything else runs the normal application build, including application
source, configuration, dependency, script, generated-data, and mixed changes.
The gate also treats renames and deletions that cross the allowlist boundary
as normal-build changes.

A known empty diff is safe to skip. If either revision is missing, the
baseline is unavailable, Git history is shallow or malformed, or the diff
cannot be read, the gate fails open and runs the normal application build.
The gate does not require application dependencies or secrets and does not
print environment-variable values.

## Application build versus deployment workflow

Vercel's Ignore Build Step controls the application build only. A
documentation-only revision can still create a Vercel deployment workflow and
a canceled deployment record after the gate returns the skip result. That
canceled record is expected; it is not a failed build and it does not mean
that the workflow or its capacity usage was prevented.

For a normal-build change, the existing project behavior remains in place:
Vercel runs `npm run build`, including the repository's `prebuild` simulation
and the Next.js build. Project-specific environment configuration remains
unchanged.
