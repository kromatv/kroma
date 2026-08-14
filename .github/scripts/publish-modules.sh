#!/usr/bin/env bash
# Cut one GitHub Release per module that `modules release` decided to publish,
# then refresh the rolling catalog release the registry worker reads.
#
# Inputs (env): GH_TOKEN, GH_REPO, SHA
# Inputs (files): dist/registry/plan.json, dist/registry/modules.json,
#                 dist/modules/<the .kmod files the plan names>
set -euo pipefail

plan=dist/registry/plan.json
catalog=dist/registry/modules.json
[[ -f $plan ]] || { echo "::error::$plan is missing; run \`modules release\` first"; exit 1; }
[[ -f $catalog ]] || { echo "::error::$catalog is missing"; exit 1; }

# The per-module releases go up FIRST. The catalog published below points every
# updated module's download URL at its own tag, so publishing the catalog before
# the bundles it names would leave the Store fetching 404s for as long as the
# rest of this script takes.
count=$(jq '.publish | length' "$plan")
echo "$count module release(s) to cut."

for i in $(seq 0 $((count - 1))); do
  tag=$(jq -r ".publish[$i].tag" "$plan")
  id=$(jq -r ".publish[$i].id" "$plan")
  version=$(jq -r ".publish[$i].version" "$plan")

  files=()
  while IFS= read -r f; do
    [[ -f dist/modules/$f ]] || { echo "::error::$tag names dist/modules/$f, which was not built"; exit 1; }
    files+=("dist/modules/$f")
  done < <(jq -r ".publish[$i].files[]" "$plan")

  if gh release view "$tag" >/dev/null 2>&1; then
    # A re-run after a partial failure. Safe to overwrite: `modules release`
    # already refused the case where these bytes differ from a version the
    # catalog says is live, so anything here is a release that never completed.
    echo "  $tag exists; re-uploading ${#files[@]} asset(s)"
  else
    gh release create "$tag" \
      --target "$SHA" \
      --title "$id $version" \
      --notes "Installable \`.kmod\` bundles for \`$id\` $version.

Install from **Admin → Modules** in KROMA; the Store resolves this from the
catalog at https://modules.kroma.tv/modules.json and verifies each SHA-256." \
      --prerelease >/dev/null
    # A prerelease so a module never becomes the repo's `latest` release and
    # displaces the server's.
    echo "  created $tag"
  fi
  gh release upload "$tag" "${files[@]}" --clobber
done

# The catalog last, and always: even a run that published no module refreshes it,
# because a module carried forward or newly absent still changes what it says.
if ! gh release view modules >/dev/null 2>&1; then
  gh release create modules \
    --target "$SHA" \
    --title 'Module registry' \
    --notes 'The merged module catalog: `modules.json`, describing the newest
release of every KROMA module. Served by https://modules.kroma.tv.

This release is a rolling container, not a snapshot - the individual bundles
live on their own `<module-id>@<version>` releases.' \
    --prerelease >/dev/null
  echo "created the rolling catalog release"
fi
gh release upload modules "$catalog" --clobber
echo "published $(jq '.modules | length' "$catalog") module(s) in the catalog"
