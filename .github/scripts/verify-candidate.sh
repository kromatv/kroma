#!/usr/bin/env bash
# Decide whether a "Build & Release" run may be promoted to a Release, and work
# out what promoting it would mean. Runs BEFORE the approval gate so a reviewer
# is only ever asked about a promotion that could actually succeed.
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

# The gate job is the contract. release.yml only creates it when every platform
# job - including both .ipa builds - succeeded, so its conclusion is a single
# answer to "did this version build everywhere?". Checking the RUN's conclusion
# instead would be wrong: a run can be red for an unrelated reason and still
# have produced a complete artifact set, and it can be green while a job the
# gate covers was skipped.
gate="$(gh api "repos/$GH_REPO/actions/runs/$RUN_ID/jobs" --paginate \
  --jq '.jobs[] | select(.name == "Candidate gate") | .conclusion')"
[[ "$gate" = "success" ]] \
  || { echo "::error::Candidate gate on run $RUN_ID is '${gate:-missing}', not success. Not promotable."; exit 1; }

# The version is whatever server/Cargo.toml said AT THAT COMMIT - not what main
# says now. Promoting an older candidate must publish the version it was built
# as, because that string is baked into every artifact's filename and manifest.
VERSION="$(gh api "repos/$GH_REPO/contents/server/Cargo.toml?ref=$SHA" \
  --jq '.content' | base64 -d \
  | sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' | head -1)"
[[ -n "$VERSION" ]] || { echo "::error::Could not read a version from server/Cargo.toml at $SHA."; exit 1; }

if gh release view "v$VERSION" >/dev/null 2>&1; then
  echo "::error::v$VERSION is already released. Bump server/Cargo.toml on main first."
  exit 1
fi

# The .spk is built by synology.yml, a separate workflow, so it lives in a
# different run - matched by COMMIT rather than by run id.
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
