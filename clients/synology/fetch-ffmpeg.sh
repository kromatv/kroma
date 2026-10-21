#!/usr/bin/env bash
# The ffmpeg every server payload ships, pinned by ffmpeg.lock, laid out as:
#   <dest>/bin/{ffmpeg,ffprobe}      wrappers, what PATH points at
#   <dest>/libexec/{ffmpeg,ffprobe}  the binaries (RUNPATH $ORIGIN/../lib)
#   <dest>/lib/                      the libraries they share, and libva
#   <dest>/dri/                      the VA-API driver, where an arch has one
# ffmpeg loads libva with dlopen from libavutil, which carries no RUNPATH, so
# the wrapper names lib/ for ffmpeg alone instead of for the whole server.
# Usage: fetch-ffmpeg.sh <x86_64|aarch64> <dest> [cache-dir]; a cached download
# is reused only while its sha256 still matches.
set -euo pipefail

ARCH="$1"
DEST="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${3:-$HERE/.cache}"
LOCK="$HERE/ffmpeg.lock"

sha256() {
  local file="$1"
  if command -v shasum >/dev/null; then shasum -a 256 "$file"; else sha256sum "$file"; fi | cut -d' ' -f1
}

# fetch <url> <sha256>: prints the path of the verified download in the cache.
fetch() {
  local url="$1" want="$2"
  local file="$CACHE/$want-$(basename "$url")"
  if [[ ! -f "$file" || "$(sha256 "$file")" != "$want" ]]; then
    curl -fsSL --show-error --connect-timeout 20 --retry 3 --retry-delay 4 --retry-all-errors \
      --proto '=https' --proto-redir '=https' "$url" -o "$file.part"
    [[ "$(sha256 "$file.part")" == "$want" ]] || { echo "$url does not match ffmpeg.lock" >&2; rm -f "$file.part"; exit 1; }
    mv "$file.part" "$file"
  fi
  printf '%s' "$file"
}

sonames() {
  local dir="$1"
  find "$dir" -maxdepth 1 -name 'lib*.so.*' | grep -E '\.so\.[0-9]+$' || true
}

read -r URL SHA < <(awk -v arch="$ARCH" '$1 == arch { print $2, $3 }' "$LOCK")
[[ -n "${URL:-}" ]] || { echo "ffmpeg.lock has no entry for $ARCH"; exit 1; }

mkdir -p "$CACHE"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tar xJf "$(fetch "$URL" "$SHA")" -C "$WORK"
ROOT="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -print -quit)"

rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/libexec" "$DEST/lib"
install -m755 "$ROOT/bin/ffmpeg" "$ROOT/bin/ffprobe" "$DEST/libexec/"
sonames "$ROOT/lib" | while read -r lib; do cp -L "$lib" "$DEST/lib/"; done
[[ -n "$(ls "$DEST/lib")" ]] || { echo "no shared libraries in the ffmpeg archive"; exit 1; }

awk -v arch="$ARCH-va" '$1 == arch { print $2, $3 }' "$LOCK" | while read -r deb sha; do
  unpacked="$WORK/deb-$sha"
  mkdir -p "$unpacked"
  ( cd "$unpacked" && ar x "$(fetch "$deb" "$sha")" && tar xf data.tar.* )
  sonames "$unpacked/usr/lib/x86_64-linux-gnu" | while read -r lib; do cp -L "$lib" "$DEST/lib/"; done
  if [[ -d "$unpacked/usr/lib/x86_64-linux-gnu/dri" ]]; then
    mkdir -p "$DEST/dri"
    cp "$unpacked/usr/lib/x86_64-linux-gnu/dri/"*_drv_video.so "$DEST/dri/"
  fi
done

for tool in ffmpeg ffprobe; do
  cat > "$DEST/bin/$tool" <<EOF
#!/bin/sh
here="\$(cd "\$(dirname "\$0")/.." && pwd)"
export LD_LIBRARY_PATH="\$here/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
[ -d "\$here/dri" ] && export LIBVA_DRIVERS_PATH="\${LIBVA_DRIVERS_PATH:-\$here/dri}"
exec "\$here/libexec/$tool" "\$@"
EOF
done
chmod 755 "$DEST/bin/"* "$DEST/lib/"*
