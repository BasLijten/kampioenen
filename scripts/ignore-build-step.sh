#!/usr/bin/env bash

# Vercel Ignore Build Step contract:
#   0 = skip the application build
#   1 = run the normal application build

set -u

previous_sha="${VERCEL_GIT_PREVIOUS_SHA-}"
commit_sha="${VERCEL_GIT_COMMIT_SHA-}"

# A missing or malformed revision means that the history cannot be trusted.
# Returning 1 is deliberately fail-open: the application build still runs.
if [[ -z "$previous_sha" || -z "$commit_sha" ]]; then
  exit 1
fi

if ! git rev-parse --verify --quiet --end-of-options "${previous_sha}^{commit}" >/dev/null 2>&1; then
  exit 1
fi

if ! git rev-parse --verify --quiet --end-of-options "${commit_sha}^{commit}" >/dev/null 2>&1; then
  exit 1
fi

if ! diff_file=$(mktemp "${TMPDIR:-/tmp}/kampioenen-ignore-build-step.XXXXXX"); then
  exit 1
fi
trap 'rm -f "$diff_file"' EXIT

if ! git diff --name-only --no-renames -z "$previous_sha" "$commit_sha" -- >"$diff_file"; then
  exit 1
fi

while IFS= read -r -d '' changed_path; do
  case "$changed_path" in
    AGENTS.md | README.md | docs/* | .agents/skills/*)
      ;;
    *)
      exit 1
      ;;
  esac
done <"$diff_file"

exit 0
