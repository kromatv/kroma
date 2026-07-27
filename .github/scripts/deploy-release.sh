#!/usr/bin/env bash
# Tag the promoted commit and publish its Release from artifacts already built.
#
# Inputs (env): GH_TOKEN, GH_REPO, TAG, VERSION, SHA, PRERELEASE, and ./assets
# holding every file to attach.
set -euo pipefail

shopt -s nullglob
files=(assets/*)
[[ ${#files[@]} -gt 0 ]] || { echo "::error::No artifacts were downloaded."; exit 1; }
echo "Publishing $TAG from $SHA with ${#files[@]} assets."

# The tag is created HERE rather than by a human pushing one, which is the whole
# point: the bytes existed and were approved before the version name was spent.
# Pointed at the promoted commit, not at whatever main has drifted to since.
if gh api "repos/$GH_REPO/git/ref/tags/${TAG#refs/tags/}" >/dev/null 2>&1; then
  echo "tag $TAG already exists; reusing it"
else
  gh api -X POST "repos/$GH_REPO/git/refs" \
    -f "ref=refs/tags/$TAG" -f "sha=$SHA" >/dev/null
  echo "created tag $TAG at $SHA"
fi

# Draft first, then upload, then flip live. A half-uploaded release must never
# be the one `releases/latest/download/modules.json` resolves to - that URL is
# the module Store's default registry and 404s would break the in-app browser.
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --target "$SHA" \
    --title "KROMA $VERSION" \
    --generate-notes \
    --draft >/dev/null
  echo "created draft release $TAG"
fi

gh release upload "$TAG" "${files[@]}" --clobber
echo "uploaded ${#files[@]} assets"

if [[ "${PRERELEASE:-false}" = "true" ]]; then
  gh release edit "$TAG" --draft=false --prerelease >/dev/null
  echo "published $TAG as a prerelease"
else
  gh release edit "$TAG" --draft=false --prerelease=false --latest >/dev/null
  echo "published $TAG and marked it latest"
fi
