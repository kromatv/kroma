#!/usr/bin/env bash
# Draft releases/<version>/ off origin/main and open its pull request. An
# existing draft branch is left alone, since a person may be editing it, unless
# FORCE is true.
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

body="$(mktemp)"
{
  echo "A draft of the $VERSION notes. Edit both files with the release-notes skill, then delete \`\"draft\": true\` from release.json so the server shows them."
  echo
  cat "$review"
} > "$body"

pr="$(gh pr list --head "$branch" --json number --jq '.[].number')"
if [[ -z "$pr" ]]; then
  gh pr create --base main --head "$branch" --title "docs(releases): the $VERSION notes" --body-file "$body"
else
  gh pr edit "$pr" --body-file "$body"
fi
