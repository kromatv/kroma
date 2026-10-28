#!/usr/bin/env bash
# Decide whether a "Build & Release" run may be promoted to a Release. Runs
# before the approval gate, so a reviewer is only asked about viable promotions.
#
# Inputs (env):  RUN_ID, GH_TOKEN, GH_REPO, PRERELEASE
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

# The version that run stamped, as its version job recorded it.
dir="$(mktemp -d)"
gh run download "$RUN_ID" -n candidate-version -D "$dir" \
  || { echo "::error::Run $RUN_ID recorded no candidate-version; it predates the computed version."; exit 1; }
VERSION="$(tr -d '[:space:]' < "$dir/candidate-version.txt")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "::error::Run $RUN_ID recorded '$VERSION', not X.Y.Z."; exit 1; }

# Already released is a conflict only for a different commit: deploy-release.sh
# reuses the tag and re-uploads with --clobber, so re-promoting the same one is
# a no-op rather than a wasted version number.
if released=$(gh release view "v$VERSION" --json targetCommitish,isPrerelease --jq '"\(.targetCommitish) \(.isPrerelease)"' 2>/dev/null); then
  released_sha="${released% *}"
  if [[ "$released_sha" != "$SHA" && "${released#* }" == "true" ]]; then
    echo "::error::v$VERSION is a prerelease of $released_sha, not $SHA, and release tags cannot move."
    echo "Delete the v$VERSION prerelease and its tag first (lift the 'release tags are immutable' rule for it), then promote again."
    exit 1
  fi
  if [[ "$released_sha" != "$SHA" ]]; then
    echo "::error::v$VERSION is already released from $released_sha, not $SHA."
    echo "Promote the newer run, or land a feat or fix so main computes the next version."
    exit 1
  fi
  echo "note: v$VERSION is already released from this same commit; re-running."
fi

# A stable promotion also publishes the desktop-stable feed from this run's
# update signatures, which a candidate built before them does not carry.
if [[ "${PRERELEASE:-false}" != "true" ]]; then
  artifacts="$(gh api "repos/$GH_REPO/actions/runs/$RUN_ID/artifacts" --paginate --jq '.artifacts[].name')"
  for os in macos macos-intel windows linux; do
    grep -qx "desktop-updater-$os" <<<"$artifacts" \
      || { echo "::error::Run $RUN_ID has no desktop-updater-$os artifact; promote a newer candidate."; exit 1; }
  done
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
