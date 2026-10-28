#!/usr/bin/env bash
# Pack KROMA.app into the tarball the Tauri updater installs on macOS and print
# its path. Run on the final app, after libmpv is embedded and the bundle is
# signed and stapled: tauri's own tarball is made before either.
#
#   updater-tarball-macos.sh [<KROMA.app>] [<out-dir>]
set -euo pipefail

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$DESKTOP/src-tauri/target/release/bundle"

APP="${1:-$(find "$BUNDLE/macos" -maxdepth 1 -name '*.app' 2>/dev/null | head -n1)}"
[[ -n "$APP" && -d "$APP" ]] || { echo "updater-tarball-macos: no .app at '${APP}', build it first." >&2; exit 1; }
OUT="${2:-$BUNDLE/updater}"

mkdir -p "$OUT"
TARBALL="$OUT/$(bash "$DESKTOP/scripts/artifact-name-macos.sh").app.tar.gz"
COPYFILE_DISABLE=1 tar -czf "$TARBALL" -C "$(dirname "$APP")" "$(basename "$APP")"
echo "$TARBALL"
