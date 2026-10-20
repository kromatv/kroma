#!/usr/bin/env bash
# Draft releases/<version>/ and open (or refresh) its pull request.
#
# Inputs (env): GH_TOKEN, GH_REPO, VERSION_INPUT (optional), ANTHROPIC_API_KEY (optional)
set -euo pipefail

args=()
[[ -n "${VERSION_INPUT:-}" ]] && args=(--version "$VERSION_INPUT")
VERSION="$(GITHUB_OUTPUT='' bun packages/ci-tools/src/cli.ts changelog "${args[@]}" \
  | sed -nE 's/^version=//p' | head -1)"
[[ -n "$VERSION" ]] || { echo "::error::No version to draft."; exit 1; }

branch="docs/release-notes-$VERSION"
git checkout -q -B "$branch"
bun packages/ci-tools/src/cli.ts notes --version "$VERSION"

git add "releases/$VERSION"
if git diff --cached --quiet; then
  echo "releases/$VERSION is unchanged"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -qm "docs(releases): draft the $VERSION notes"
git push -qf origin "$branch"

if [[ -z "$(gh pr list --head "$branch" --json number --jq '.[].number')" ]]; then
  gh pr create --base main --head "$branch" --title "docs(releases): the $VERSION notes" \
    --body "A draft of the $VERSION notes. Edit both files with the release-notes skill, then delete \`\"draft\": true\` from release.json so the server shows them."
fi
