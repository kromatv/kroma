#!/usr/bin/env bash
# Draft releases/<version>/ off origin/main and push it as a branch. Actions
# may not open pull requests in this repository, so the run summary carries the
# link that opens one and the writer's review notes for its body. An existing
# draft branch is left alone, since a person may be editing it, unless FORCE is
# true.
#
# Inputs (env): GH_TOKEN, GH_REPO, VERSION_INPUT, FORCE, and the ANTHROPIC_*
# federation variables (optional)
set -euo pipefail

git fetch -q origin main
git checkout -q --detach origin/main

args=()
[[ -n "${VERSION_INPUT:-}" ]] && args=(--version "$VERSION_INPUT")
review="$(mktemp)"
out="$(GITHUB_OUTPUT='' bun packages/ci-tools/src/cli.ts notes --review "$review" "${args[@]}")"
echo "$out"
VERSION="$(sed -nE 's/^version=//p' <<<"$out" | head -1)"
[[ -n "$VERSION" ]] || { echo "::error::No version was drafted."; exit 1; }

branch="docs/release-notes-$VERSION"
if git ls-remote --exit-code --heads origin "$branch" >/dev/null && [[ "${FORCE:-false}" != true ]]; then
  echo "::notice::$branch already exists and may hold edits; rerun with force to replace it."
  exit 0
fi

git checkout -q -B "$branch"
git add "releases/$VERSION"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -qm "docs(releases): draft the $VERSION notes"
git push -qf origin "$branch"

{
  echo "### Draft of the $VERSION notes"
  echo
  echo "Open the pull request: $GITHUB_SERVER_URL/$GH_REPO/compare/main...$branch?expand=1"
  echo
  echo "Edit both files with the release-notes skill, then delete \`\"draft\": true\` from release.json so the server shows them. Paste the notes below into the pull request body."
  echo
  cat "$review"
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
