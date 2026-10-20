#!/usr/bin/env bash
# The Release body: the hand-written note from releases/<version>/en.md when
# there is one, then every feature and fix the commits up to $SHA carry.
#
# Inputs (env): VERSION, SHA. Output: release-notes.md
set -euo pipefail

GITHUB_OUTPUT='' bun packages/ci-tools/src/cli.ts changelog \
  --version "$VERSION" --to "$SHA" --out changes.md >/dev/null

note="releases/$VERSION/en.md"
{
  if git show "$SHA:$note" >/dev/null 2>&1; then
    git show "$SHA:$note"
    echo
    echo "## All changes"
    echo
  fi
  tail -n +3 changes.md
} > release-notes.md
cat release-notes.md
