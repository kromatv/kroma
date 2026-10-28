#!/usr/bin/env bash
# Package KROMA.app into the styled installer dmg and print the dmg's path.
#
#   package-dmg-macos.sh [<KROMA.app>] [<out.dmg>]
#
# Defaults to the app `tauri build` wrote and to KROMA_<version>_<arch>.dmg in
# bundle/dmg, the name tauri's own bundler gives the other installers. Needs
# Python 3.10+; nothing else is installed outside a throwaway venv.
set -euo pipefail

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$DESKTOP/src-tauri/target/release/bundle"

APP="${1:-$(find "$BUNDLE/macos" -maxdepth 1 -name '*.app' 2>/dev/null | head -n1)}"
[[ -n "$APP" && -d "$APP" ]] || { echo "package-dmg-macos: no .app at '${APP}', build it first." >&2; exit 1; }

VERSION=$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' \
  "$DESKTOP/src-tauri/tauri.conf.json" | head -1)
DMG="${2:-$BUNDLE/dmg/$(bash "$DESKTOP/scripts/artifact-name-macos.sh").dmg}"

WORK="$(mktemp -d)"
MNT=""
cleanup() {
  if [[ -n "$MNT" ]]; then hdiutil detach "$MNT" -quiet -force || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  echo "package-dmg-macos: dmgbuild needs Python 3.10+, found $(python3 --version 2>&1)." >&2
  exit 1
fi
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install --quiet --disable-pip-version-check \
  --only-binary :all: --no-deps --require-hashes \
  -r "$DESKTOP/dmg/requirements.txt" >&2

mkdir -p "$(dirname "$DMG")"
"$WORK/venv/bin/dmgbuild" \
  -s "$DESKTOP/dmg/settings.py" \
  -D app="$APP" \
  -D background="$DESKTOP/dmg/background.png" \
  -D icon="$DESKTOP/src-tauri/icons/icon.icns" \
  "KROMA${VERSION:+ $VERSION}" "$DMG" >&2

mkdir "$WORK/mnt"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$WORK/mnt" "$DMG" >/dev/null
MNT="$WORK/mnt"
for entry in "$(basename "$APP")" .background.tiff .DS_Store .VolumeIcon.icns; do
  [[ -e "$MNT/$entry" ]] || { echo "package-dmg-macos: $DMG has no $entry." >&2; exit 1; }
done
[[ "$(readlink "$MNT/Applications")" == /Applications ]] || {
  echo "package-dmg-macos: $DMG has no Applications link." >&2
  exit 1
}
hdiutil detach "$MNT" -quiet
MNT=""

echo "$DMG"
