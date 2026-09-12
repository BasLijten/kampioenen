# Vercel Ignored Build Step: research findings

Research for [Research Vercel Ignore Build Step diff and exit-code behavior](https://github.com/BasLijten/kampioenen/issues/73).

- Researched: 2026-09-12
- Branch: `research/vercel-ignore-build-step`
- Base revision: `ceb24bf14d376da1f42f95a0beb28092c669d774`
- Scope: Vercel's documented Ignored Build Step contract only. No deployment filter is implemented here.

## Findings

### Command contract and exit codes

Vercel runs the configured command when a deployment reaches `BUILDING`. The command is run from the project's configured **Root Directory** and can access Vercel System Environment Variables. The command is a gate:

- exit `1`: continue with the normal build and deployment;
- exit `0`: skip the build and mark the deployment `CANCELED`.

Vercel's Project Settings documentation describes the command as returning only `0` or `1`; its Ignored Build Step guide also says that `1` or greater causes a build. A repository script should deliberately return only `0` or `1`, rather than treating other nonzero statuses as a supported third state.

Important operational consequence: a canceled build still counts as a full deployment and consumes deployment quota and a concurrent build slot. This mechanism prevents the application build from completing, but it does not prevent Vercel from creating and starting the deployment/build workflow.

Sources: [Project Settings — Ignored Build Step](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step), [Vercel KB — How do I use the “Ignored Build Step” field?](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel)

### Available deployment and Git inputs

The System Environment Variables page documents these inputs relevant to an ignore script:

| Variable | Meaning | Availability |
| --- | --- | --- |
| `VERCEL_ENV` | Deployment environment: `production`, `preview`, or `development` | Build and runtime |
| `VERCEL_TARGET_ENV` | System or custom target environment | Build and runtime |
| `VERCEL_GIT_PROVIDER` | Git provider, such as `github` | Build and runtime |
| `VERCEL_GIT_REPO_SLUG` | Origin repository slug | Build and runtime |
| `VERCEL_GIT_REPO_OWNER` | Account that owns the repository | Build and runtime |
| `VERCEL_GIT_REPO_ID` | Repository ID | Build and runtime |
| `VERCEL_GIT_COMMIT_REF` | Branch containing the deployment commit | Build and runtime |
| `VERCEL_GIT_COMMIT_SHA` | SHA of the deployment commit | Build and runtime |
| `VERCEL_GIT_COMMIT_MESSAGE` | Deployment commit message, truncated above 2048 bytes | Build and runtime |
| `VERCEL_GIT_COMMIT_AUTHOR_LOGIN` | Commit author's username | Build and runtime |
| `VERCEL_GIT_COMMIT_AUTHOR_NAME` | Commit author's name | Build and runtime |
| `VERCEL_GIT_PREVIOUS_SHA` | SHA of the last successful deployment for this project and branch | Build only; only exposed when an Ignored Build Step is provided |
| `VERCEL_GIT_PULL_REQUEST_ID` | Pull request ID; empty if a branch deployment predates the pull request | Build and runtime |

System Environment Variables must be enabled for the project in Vercel Project Settings. The KB specifically calls this out when an ignore command uses values such as `VERCEL_ENV`; the current dashboard wording is “Enable access to System Environment Variables.”

For this effort, `VERCEL_GIT_COMMIT_SHA` identifies the current commit, while `VERCEL_GIT_PREVIOUS_SHA` is the useful project-and-branch deployment baseline. The latter is not a general Git parent pointer and is not a runtime variable.

Sources: [System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Vercel KB — environment-variable usage in Ignored Build Step](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel)

### Preview, production, and first-deployment behavior

Vercel defines a production deployment as one made from the Production Branch (usually `main`) or with `vercel --prod`; a deployment from another Git branch, or a normal `vercel` CLI deployment, is preview. The `VERCEL_ENV` value is correspondingly `production` or `preview` for these Git deployments. Vercel provides built-in “Only build production” and “Only build preview” ignore behaviors, but a path-based filter needs to evaluate the diff for both environments if documentation-only changes should be skipped in both preview and production.

`VERCEL_GIT_PREVIOUS_SHA` means the last **successful deployment for the same project and branch**, not the previous commit and not necessarily the immediately preceding deployment attempt. On a branch's first deployment there is no prior successful deployment, so the variable is empty. This first-deployment clarification is given by Vercel staff in the official Vercel Community support thread; the System Environment Variables documentation establishes the variable's successful-deployment/project/branch semantics.

Therefore, a future implementation must define a safe no-baseline path. It must not pass an empty `VERCEL_GIT_PREVIOUS_SHA` to `git diff` and assume it means “the parent commit.” An initial commit also has no `HEAD^` parent.

Sources: [Environment Variables — environments](https://vercel.com/docs/environment-variables#environments), [System Environment Variables — `VERCEL_GIT_PREVIOUS_SHA`](https://vercel.com/docs/environment-variables/system-environment-variables#vercel-git-previous-sha), [Vercel Community — `VERCEL_GIT_PREVIOUS_SHA` is empty](https://community.vercel.com/t/vercel-git-previous-sha-is-empty/821)

### Shallow clone and diff baselines

For Git-connected builds, Vercel performs a shallow clone with `git clone --depth=10`. Vercel's own examples use `git diff HEAD^ HEAD --quiet` for a one-commit comparison, and show that the diff path is interpreted relative to the configured Root Directory. A script comparing the current commit to `VERCEL_GIT_PREVIOUS_SHA` may fail if that older successful-deployment commit is outside the shallow clone's available history; this is an inference from the documented depth and the variable's potentially older baseline, not a separately documented Vercel guarantee.

Vercel's own local-debugging recipe is to clone with `--depth=10`, run the command, and inspect the resulting shell exit code. Any future validation should reproduce that shallow-clone shape and cover: one commit, multiple commits since the last successful deployment, a first deployment with no previous SHA, and a baseline beyond the available history.

Sources: [Vercel KB — shallow clone and diff examples](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel), [Builds — Git builds use a shallow clone](https://vercel.com/docs/builds#how-builds-are-triggered)

### `vercel.json` and `vercel.ts` support

Both repository-owned configuration formats support the `ignoreCommand` property:

- In `vercel.json`, `ignoreCommand` is a `string | null` and overrides the Ignored Build Step command in Project Settings for the deployment.
- In `vercel.ts`, `ignoreCommand` is also a `string | null` in the exported `config` object and has the same override behavior. Vercel's programmatic configuration docs show the required `export const config` shape and the same exit-code semantics.

Only one project configuration file may be used at a time (`vercel.json` or `vercel.ts`; Vercel also documents static TOML separately). A `vercel.ts` configuration requires the `@vercel/config` package according to Vercel's setup instructions. For a repository-wide shell script, the configuration value is a command such as `bash scripts/<name>.sh`; the script must exist in the repository and its path must be valid from the project's Root Directory.

Sources: [Static Configuration with `vercel.json` — `ignoreCommand`](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand), [Programmatic Configuration with `vercel.ts` — `ignoreCommand`](https://vercel.com/docs/project-configuration/vercel-ts#ignorecommand), [Project Configuration overview](https://vercel.com/docs/project-configuration)

### Redeploy behavior and already-deployed SHAs

The Project Settings documentation says that the Ignore Build Step can also be applied during a dashboard redeploy. In the deployment's **Redeploy** flow, the operator can uncheck **Use project's Ignore Build Step** to force the build to run. This is the documented escape hatch when a manual redeploy should proceed regardless of the filter.

Separately, when a Git commit SHA has already been deployed, Vercel does not create a new deployment for that SHA; it returns the last deployment matching it. This is distinct from an ignore-command cancellation and should be considered when validating “redeploy” versus “new commit” behavior.

Source: [Project Settings — Ignore Build Step on redeploy](https://vercel.com/docs/project-configuration/project-settings#ignore-build-step-on-redeploy)

## Decision-relevant implications for the next ticket

1. The filter must return `0` for documentation/skills-only changes and `1` for any other change.
2. The comparison must work for both preview and production; `VERCEL_ENV` is available if environment-specific behavior is needed, but it is not sufficient to identify changed paths.
3. The implementation must choose and document a no-previous-SHA strategy, including the first deployment and initial commit.
4. The implementation must be tested against Vercel's `--depth=10` clone shape and must not assume unlimited Git history.
5. Configuration can be repository-owned via `ignoreCommand` in either `vercel.json` or `vercel.ts`, but only one config format can be active per project; dashboard settings remain the equivalent project-level control.
6. A skipped build is canceled after the workflow reaches `BUILDING` and still consumes Vercel deployment/build capacity, so the acceptance criterion should distinguish “application build does not run” from “no Vercel deployment workflow is created.”
