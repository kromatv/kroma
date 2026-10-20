#!/usr/bin/env bash
# The Release body: the note from releases/<version>/en.md when there is one
# and its release.json does not mark it a draft, then every feature and fix the
# commits up to $SHA carry.
#
# Inputs (env): VERSION, SHA. Output: release-notes.md
set -euo pipefail

GITHUB_OUTPUT='' bun packages/ci-tools/src/cli.ts changelog \
  --version "$VERSION" --to "$SHA" --out changes.md >/dev/null

note="releases/$VERSION/en.md"
written=false
if git show "$SHA:$note" >/dev/null 2>&1; then
  written=true
  if meta="$(git show "$SHA:releases/$VERSION/release.json" 2>/dev/null)" \
    && ! jq -e '.draft != true' >/dev/null 2>&1 <<<"$meta"; then
    echo "::warning::releases/$VERSION is still a draft; the Release body is the change list alone."
    written=false
  fi
fi
{
  if [[ "$written" == true ]]; then
    git show "$SHA:$note"
    echo
    echo "## All changes"
    echo
  fi
  tail -n +3 changes.md
} > release-notes.md
cat release-notes.md
