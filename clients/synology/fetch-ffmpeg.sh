#!/usr/bin/env bash
# The ffmpeg every server payload ships, pinned by ffmpeg.lock: ffmpeg and
# ffprobe in <dest>/bin, the libraries they share in <dest>/lib (the binaries
# carry RUNPATH $ORIGIN/../lib). Usage: fetch-ffmpeg.sh <x86_64|aarch64> <dest>
# [cache-dir]; a cached archive is reused only while its sha256 still matches.
set -euo pipefail

ARCH="$1"
DEST="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${3:-$HERE/.cache}"

read -r URL SHA < <(awk -v arch="$ARCH" '$1 == arch { print $2, $3 }' "$HERE/ffmpeg.lock")
[ -n "${URL:-}" ] || { echo "ffmpeg.lock has no entry for $ARCH"; exit 1; }

sha256() { if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1; }

mkdir -p "$CACHE"
ARCHIVE="$CACHE/ffmpeg-$SHA.tar.xz"
if [ ! -f "$ARCHIVE" ] || [ "$(sha256 "$ARCHIVE")" != "$SHA" ]; then
  curl -fsSL --show-error --connect-timeout 20 --retry 3 --retry-delay 4 --retry-all-errors \
    --proto '=https' --proto-redir '=https' "$URL" -o "$ARCHIVE.part"
  [ "$(sha256 "$ARCHIVE.part")" = "$SHA" ] || { echo "ffmpeg archive does not match ffmpeg.lock"; rm -f "$ARCHIVE.part"; exit 1; }
  mv "$ARCHIVE.part" "$ARCHIVE"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar xJf "$ARCHIVE" -C "$WORK"
ROOT="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -print -quit)"

rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/lib"
install -m755 "$ROOT/bin/ffmpeg" "$ROOT/bin/ffprobe" "$DEST/bin/"
find "$ROOT/lib" -maxdepth 1 -name 'lib*.so.*' | grep -E '\.so\.[0-9]+$' | while read -r soname; do
  cp -L "$soname" "$DEST/lib/"
done
chmod 755 "$DEST/lib/"*
[ -n "$(ls "$DEST/lib")" ] || { echo "no shared libraries in the ffmpeg archive"; exit 1; }
