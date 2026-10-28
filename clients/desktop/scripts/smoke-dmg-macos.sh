#!/usr/bin/env bash
# Mount a dmg and launch the app inside it with smoke-launch.sh: the bytes a
# user drags to Applications, not the build tree's copy.
#
#   smoke-dmg-macos.sh <KROMA.dmg> [seconds]
set -euo pipefail

DMG="${1:?usage: smoke-dmg-macos.sh <KROMA.dmg> [seconds]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MNT="$(mktemp -d)"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null
trap 'hdiutil detach "$MNT" -quiet -force || true; rmdir "$MNT" 2>/dev/null || true' EXIT

APP="$(find "$MNT" -maxdepth 1 -name '*.app' | head -n1)"
[[ -n "$APP" ]] || { echo "smoke-dmg-macos: no .app in $DMG" >&2; exit 1; }
EXE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
bash "$HERE/smoke-launch.sh" "$APP/Contents/MacOS/$EXE" "${2:-20}"
