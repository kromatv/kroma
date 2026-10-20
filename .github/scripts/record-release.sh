#!/usr/bin/env bash
# After a release: a pull request that gives CHANGELOG.md its section and moves
# server/Cargo.toml to the version just shipped. main takes no direct push, and
# a `chore(release)` commit releases nothing on its own.
#
# Inputs (env): VERSION, SHA, GH_TOKEN, GH_REPO
set -euo pipefail

branch="chore/release-$VERSION"
git fetch -q origin main
git checkout -q -B "$branch" origin/main
bun packages/ci-tools/src/cli.ts changelog --version "$VERSION" --to "$SHA" --write >/dev/null

if git diff --quiet; then
  echo "main already records $VERSION"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -qam "chore(release): $VERSION"
git push -qf origin "$branch"

if [[ -z "$(gh pr list --head "$branch" --json number --jq '.[].number')" ]]; then
  gh pr create --base main --head "$branch" --title "chore(release): $VERSION" \
    --body "Records v$VERSION on main: its CHANGELOG.md section and the server/Cargo.toml version."
fi
echo "opened the record of $VERSION"
