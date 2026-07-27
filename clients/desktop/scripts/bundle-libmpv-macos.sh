#!/usr/bin/env bash
# Embed libmpv + its non-system dylib tree into KROMA.app so the distributed .dmg
# runs on a Mac WITHOUT Homebrew.
#
# `tauri build` links the shell against Homebrew's libmpv via an ABSOLUTE install
# name (otool -L shows /opt/homebrew/opt/mpv/lib/libmpv.2.dylib), which only exists
# on a dev box. dylibbundler copies libmpv AND everything it transitively pulls (the
# ffmpeg decode stack) into Contents/Frameworks and rewrites every install name to
# @executable_path/../Frameworks, making the .app self-contained.
#
# Run AFTER `tauri build`, BEFORE codesign/notarize: rewriting the Mach-O load
# commands invalidates any prior signature, so the release workflow signs the .app
# (deep) only after this step. Idempotent-ish: re-running overwrites the dir.
set -euo pipefail

APP="${1:?usage: bundle-libmpv-macos.sh <path-to-KROMA.app>}"
[[ -d "$APP" ]] || { echo "bundle-libmpv-macos: no .app at $APP" >&2; exit 1; }

EXE_DIR="$APP/Contents/MacOS"
# The Tauri binary (named after productName); exactly one Mach-O executable lives here.
EXE="$(find "$EXE_DIR" -maxdepth 1 -type f -perm -111 | head -n1)"
[[ -n "$EXE" ]] || { echo "bundle-libmpv-macos: no executable in $EXE_DIR" >&2; exit 1; }

if ! command -v dylibbundler >/dev/null 2>&1; then
  echo "bundle-libmpv-macos: dylibbundler not found (brew install dylibbundler)" >&2
  exit 1
fi

echo "bundle-libmpv-macos: embedding libmpv + deps for $EXE"
# -cd create-dir, -od overwrite-dir, -b bundle-deps (recurse into libmpv's own deps),
# -x fix-file (the executable), -d dest-dir, -p install-path.
dylibbundler -cd -od -b \
  -x "$EXE" \
  -d "$APP/Contents/Frameworks" \
  -p "@executable_path/../Frameworks"

# Collapse duplicate LC_RPATH entries.
#
# dyld on macOS 26+ treats a REPEATED rpath as a fatal error - the app dies at
# launch with "Library not loaded ... (duplicate LC_RPATH
# '@executable_path/../Frameworks/')" and never reaches main(). Older dyld simply
# ignored the repeat, which is why this survived unnoticed: the bundle is only
# broken on a current macOS.
#
# dylibbundler is what repeats it. It runs `install_name_tool -add_rpath` each
# time it fixes a binary, without checking whether that rpath is already there,
# so anything reachable by MORE THAN ONE path through the dependency graph gets
# it twice - libmpv is both a direct dependency of the executable and a
# dependency of other bundled dylibs.
rpaths_of() {
  local binary="$1"
  otool -l "$binary" | awk '/cmd LC_RPATH/ { f = 1; next } f && /^ *path / { print $2; f = 0 }'
}

prune_duplicate_rpaths() {
  local binary="$1"
  for dup in $(rpaths_of "$binary" | sort | uniq -d); do
    # -delete_rpath removes ONE occurrence per call, so loop until one is left.
    while [[ "$(rpaths_of "$binary" | grep -cx -- "$dup" || true)" -gt 1 ]]; do
      install_name_tool -delete_rpath "$dup" "$binary"
    done
    echo "bundle-libmpv-macos: collapsed duplicate rpath $dup in $(basename "$binary")"
  done
}

prune_duplicate_rpaths "$EXE"
for lib in "$APP/Contents/Frameworks"/*.dylib; do
  [[ -f "$lib" ]] && prune_duplicate_rpaths "$lib"
done

echo "bundle-libmpv-macos: done"
# Fail loudly if any absolute Homebrew path survived (would break on a clean Mac).
if otool -L "$EXE" | grep -qE '/opt/homebrew|/usr/local/(opt|Cellar)'; then
  echo "bundle-libmpv-macos: WARNING - a Homebrew path is still referenced:" >&2
  otool -L "$EXE" | grep -E '/opt/homebrew|/usr/local/(opt|Cellar)' >&2
  exit 1
fi
