#!/usr/bin/env bash
# Decide whether a "Build & Release" run may be promoted to a Release. Runs
# before the approval gate, so a reviewer is only asked about viable promotions.
#
# Inputs (env):  RUN_ID, GH_TOKEN, GH_REPO
# Outputs (GITHUB_OUTPUT): version, sha, synology_run
set -euo pipefail

run="$(gh api "repos/$GH_REPO/actions/runs/$RUN_ID")"
name="$(jq -r '.name' <<<"$run")"
status="$(jq -r '.status' <<<"$run")"
branch="$(jq -r '.head_branch' <<<"$run")"
SHA="$(jq -r '.head_sha' <<<"$run")"

[[ "$name" = "Build & Release" ]] \
  || { echo "::error::Run $RUN_ID is '$name', not a Build & Release run."; exit 1; }
[[ "$status" = "completed" ]] \
  || { echo "::error::Run $RUN_ID is still $status."; exit 1; }
[[ "$branch" = "main" ]] \
  || { echo "::error::Run $RUN_ID built '$branch'. Only main is promotable."; exit 1; }

# The gate job, not the run conclusion: a run can be red for an unrelated reason
# with a complete artifact set, or green with a covered job skipped.
gate="$(gh api "repos/$GH_REPO/actions/runs/$RUN_ID/jobs" --paginate \
  --jq '.jobs[] | select(.name == "Candidate gate") | .conclusion')"
[[ "$gate" = "success" ]] \
  || { echo "::error::Candidate gate on run $RUN_ID is '${gate:-missing}', not success. Not promotable."; exit 1; }

# The version as of that commit, not as of main: the string is baked into every
# artifact's filename and manifest.
VERSION="$(gh api "repos/$GH_REPO/contents/server/Cargo.toml?ref=$SHA" \
  --jq '.content' | base64 -d \
  | sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' | head -1)"
[[ -n "$VERSION" ]] || { echo "::error::Could not read a version from server/Cargo.toml at $SHA."; exit 1; }

# Already released is a conflict only for a different commit: deploy-release.sh
# reuses the tag and re-uploads with --clobber, so re-promoting the same one is
# a no-op rather than a wasted version number.
if released_sha=$(gh release view "v$VERSION" --json targetCommitish --jq '.targetCommitish' 2>/dev/null); then
  if [[ "$released_sha" != "$SHA" ]]; then
    echo "::error::v$VERSION is already released from $released_sha, not $SHA."
    echo "Bump server/Cargo.toml on main before promoting a different commit."
    exit 1
  fi
  echo "note: v$VERSION is already released from this same commit; re-running."
fi

# The .spk comes from synology.yml, a separate workflow, so it is matched by
# commit rather than by run id.
SYN="$(gh api "repos/$GH_REPO/actions/runs?head_sha=$SHA&status=success" --paginate \
  --jq '[.workflow_runs[] | select(.name == "Synology")] | max_by(.run_started_at) | .id // empty')"
[[ -n "$SYN" ]] \
  || { echo "::error::No successful Synology run for $SHA; the .spk would be missing."; exit 1; }

{
  echo "version=$VERSION"
  echo "sha=$SHA"
  echo "synology_run=$SYN"
} >> "$GITHUB_OUTPUT"

echo "Promotable: v$VERSION from $SHA (build $RUN_ID, synology $SYN)"
