#!/usr/bin/env bash
# Give the Docker image built for the promoted commit the release's own tags.
#
# Inputs (env): VERSION (X.Y.Z), PRERELEASE, IMAGE, and ./spk holding the
# Synology run's kroma-synology-spk artifact, whose file name carries the
# build the image was pushed under.
set -euo pipefail

spk="$(find spk -name 'kroma-*-x86_64.spk' -print -quit)"
[[ -n "$spk" ]] || { echo "::error::The Synology run carries no .spk to read the build from."; exit 1; }
build="$(basename "$spk")"
build="${build#kroma-}"
build="${build%-x86_64.spk}"

source="$IMAGE:$build"
docker buildx imagetools inspect "$source" >/dev/null \
  || { echo "::error::$source was never pushed; the Synology run built no image."; exit 1; }

names=("$VERSION")
[[ "$PRERELEASE" == "true" ]] || names+=("${VERSION%.*}" stable)

args=()
for name in "${names[@]}"; do args+=(--tag "$IMAGE:$name"); done
echo "Tagging $source as ${names[*]}"
docker buildx imagetools create "${args[@]}" "$source"
