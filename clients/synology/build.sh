#!/usr/bin/env bash
# Build a single self-contained KROMA Synology package (.spk) for x86_64 DSM 7:
# kroma-server (also serving the web SPA) + static ffmpeg/ffprobe.
#
# Usage:   clients/synology/build.sh [version]
# Env:     RUST_IMAGE   musl cross image (default messense/rust-musl-cross:x86_64-musl)
#          SKIP_RUST=1  reuse an existing musl binary (faster re-packaging)
#          SKIP_WEB=1   reuse an existing web build
set -euo pipefail

# Read from server/Cargo.toml so the .spk version, the in-app version
# (CARGO_PKG_VERSION) and CI all agree. Override with $1.
_CARGO_TOML="$(cd "$(dirname "$0")/../.." && pwd)/server/Cargo.toml"
CARGO_VERSION="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$_CARGO_TOML" | head -1)"
EXPLICIT_VERSION="${1:-}"
VERSION="${EXPLICIT_VERSION:-${CARGO_VERSION:-0.1.0}}"
# Canary (no explicit version) gets `X.Y.Z.BUILD-BUILD`, stable gets `X.Y.Z-BUILD`.
CANARY="${CANARY:-$([ -z "$EXPLICIT_VERSION" ] && echo 1 || echo 0)}"
# DSM installs a manual .spk over an existing one ONLY when the new version is
# strictly greater, and reports a refusal as the misleading webapi 4521 "invalid
# file format" - which pushes you into a delete + reinstall that wipes var/. Its
# check compares the dotted FEATURE version and ignores the -build suffix.
# THE RULE: the version must only ever go UP. Bump X.Y.Z for every release, and
# keep BUILD as minutes since 2020-01-01 UTC - shrinking its magnitude (minutes
# to days) once made every new build read as a downgrade. Override with BUILD=...
BUILD="${BUILD:-$(( ( $(date -u +%s) - 1577836800 ) / 60 ))}"
ARCH="x86_64"
TARGET="x86_64-unknown-linux-musl"
# Digest-pinned: a moving tag swaps rustc underneath and invalidates every cached
# build artifact (CI caches server/target across runs).
RUST_IMAGE="${RUST_IMAGE:-messense/rust-musl-cross:x86_64-musl@sha256:ce75e9174325d4fbb3de85c309e2d7ca29f7500169bc4b5d2c611ff7e86d549a}"
# Static ffmpeg/ffprobe, tried in order: the primary stays first so a normal build
# ships what it always has, and BtbN's GPL static build (different machine, different
# network) only decides whether an outage of the primary costs a release.
FFMPEG_URL="${FFMPEG_URL:-https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz}"
FFMPEG_FALLBACK_URL="${FFMPEG_FALLBACK_URL:-https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKEL="$ROOT/clients/synology/spk"
OUT="$ROOT/clients/synology/dist"
WORK="$(mktemp -d)"
CACHE="$ROOT/clients/synology/.cache"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$CACHE"

say() { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }

# DSM's Package Center tar accepts POSIX ustar but rejects GNU tar's default "gnu"
# format, so a Linux/CI-built .spk failed to install while a macOS-built one worked.
# xattrs/ACLs are stripped so its busybox tar doesn't choke on SCHILY/pax records.
# `--no-mac-metadata` is BSD/macOS-tar only, hence the probe.
TAR_CLEAN=(--format=ustar --no-xattrs --no-acls)
if tar --no-mac-metadata --help >/dev/null 2>&1; then
  TAR_CLEAN+=(--no-mac-metadata)
fi
sha256() { if command -v shasum >/dev/null; then shasum -a 256 "$@"; else sha256sum "$@"; fi; }

if [ "${SKIP_WEB:-}" != "1" ]; then
  say "Building web SPA"
  ( cd "$ROOT" && bun run build:web )
fi
[ -f "$ROOT/clients/web/dist/client/_shell.html" ] || { echo "web build missing (_shell.html)"; exit 1; }

BIN="$ROOT/server/target/$TARGET/release/kroma-server"
if [ "${SKIP_RUST:-}" != "1" ]; then
  command -v docker >/dev/null || { echo "Docker required for the musl cross-build (or set SKIP_RUST=1 after a manual build)"; exit 1; }
  say "Cross-compiling kroma-server → $TARGET (Docker: $RUST_IMAGE)"
  # `whisper-local`: in-process Whisper (candle) so the .spk transcribes with no
  # external binary; the pure-Rust CPU backend still links on musl.
  # The WHOLE repo is mounted, not server/ alone: i18n.rs `include_str!`s the
  # shared locale catalogs at ../../packages/core/src/locales/*.json, and the
  # server path-deps three modules at ../modules/<id>/server — both outside
  # server/, so anything narrower leaves a path dangling.
  docker run --rm -v "$ROOT":/home/rust/repo -w /home/rust/repo/server \
    -v "$CACHE/cargo":/root/.cargo/registry \
    "$RUST_IMAGE" cargo build --release --target "$TARGET" --features whisper-local
fi
[ -f "$BIN" ] || { echo "musl binary missing: $BIN"; exit 1; }

FF="$CACHE/ffmpeg-amd64-static"

# `--connect-timeout`: without it a host that accepts no connections is retried
# five times at ~135 s each, so an outage burned 24 minutes and failed anyway.
# `--retry-all-errors`: the primary intermittently answers a spurious 4xx.
fetch_ffmpeg() {
  curl -fSL --connect-timeout 20 --retry 3 --retry-delay 4 --retry-all-errors \
    --proto '=https' --proto-redir '=https' "$1" -o "$2" \
    && xz -t "$2" 2>/dev/null
}

if [ ! -x "$FF/ffmpeg" ]; then
  say "Fetching static ffmpeg/ffprobe"
  if ! fetch_ffmpeg "$FFMPEG_URL" "$WORK/ff.tar.xz"; then
    say "Primary ffmpeg source did not answer with an archive, trying the fallback"
    fetch_ffmpeg "$FFMPEG_FALLBACK_URL" "$WORK/ff.tar.xz" \
      || { echo "both ffmpeg sources failed"; exit 1; }
  fi

  # Extracted whole rather than with --strip-components: the primary puts the
  # binaries at the root of its directory, BtbN puts them under `bin/`.
  mkdir -p "$WORK/ffx" && tar xJf "$WORK/ff.tar.xz" -C "$WORK/ffx"
  mkdir -p "$FF"
  for tool in ffmpeg ffprobe; do
    found="$(find "$WORK/ffx" -type f -name "$tool" -perm -u+x -print -quit)"
    [ -n "$found" ] || { echo "$tool missing from the ffmpeg archive"; exit 1; }
    install -m755 "$found" "$FF/$tool"
  done

  # The tarball URL is a moving "latest release" pointer, so there is no checksum
  # to pin. Running it catches a truncated download, an HTML error page saved as a
  # tarball, and an archive for the wrong architecture.
  "$FF/ffmpeg" -version >/dev/null 2>&1 \
    || { echo "downloaded ffmpeg does not run"; exit 1; }
fi

say "Staging payload"
PAY="$WORK/payload"
mkdir -p "$PAY/bin" "$PAY/web" "$PAY/ffmpeg"
install -m755 "$BIN" "$PAY/bin/kroma-server"
cp -R "$ROOT/clients/web/dist/client/." "$PAY/web/"
install -m755 "$FF/ffmpeg" "$PAY/ffmpeg/ffmpeg"
install -m755 "$FF/ffprobe" "$PAY/ffmpeg/ffprobe"
# Strip macOS xattrs so bsdtar doesn't embed SCHILY.xattr pax records that DSM's
# busybox tar can reject. COPYFILE_DISABLE stops AppleDouble.
xattr -cr "$PAY" 2>/dev/null || true
( cd "$PAY" && COPYFILE_DISABLE=1 tar "${TAR_CLEAN[@]}" -czf "$WORK/package.tgz" . )

say "Assembling .spk"
SPK="$WORK/spk"
mkdir -p "$SPK"
cp -R "$SKEL/scripts" "$SKEL/conf" "$SKEL/WIZARD_UIFILES" "$SPK/"
chmod 755 "$SPK/scripts/"*
cp "$WORK/package.tgz" "$SPK/package.tgz"
# INFO extractsize is read in KB on DSM 6+; bytes made DSM believe the package
# needed ~190 GB after extraction.
EXT_SIZE="$(( $(gzip -dc "$WORK/package.tgz" | wc -c | tr -d ' ') / 1024 ))"
# Canary/nightly builds share one X.Y.Z, so BUILD sits in a 4th feature segment
# to keep each one strictly newer than the last (see the version note above). It
# is stamped ONCE: deploy.yml promotes a canary .spk as-is into the stable
# Release, so a repeated suffix ships to everyone as `X.Y.Z.BUILD-BUILD`.
if [ "$CANARY" = "1" ]; then
  INFO_VERSION="$VERSION.$BUILD"
else
  INFO_VERSION="$VERSION-$BUILD"
fi
sed -e "s/@INFO_VERSION@/$INFO_VERSION/g" -e "s/@ARCH@/$ARCH/g" -e "s/@SIZE@/$EXT_SIZE/g" \
  "$SKEL/INFO.template" > "$SPK/INFO"
say "DSM package version: $INFO_VERSION ($([ "$CANARY" = 1 ] && echo 'canary: 4th-segment build keeps every nightly upgradable' || echo 'stable: X.Y.Z orders releases, BUILD is the versionCode'))"
cp "$SKEL/PACKAGE_ICON.PNG" "$SKEL/PACKAGE_ICON_256.PNG" "$SPK/"

OUT_SPK="$OUT/kroma-$INFO_VERSION-$ARCH.spk"
# INFO first: DSM reads it first. Members listed explicitly rather than globbed.
xattr -cr "$SPK" 2>/dev/null || true
( cd "$SPK" && COPYFILE_DISABLE=1 tar "${TAR_CLEAN[@]}" \
    -cf "$OUT_SPK" INFO package.tgz conf scripts WIZARD_UIFILES \
    PACKAGE_ICON.PNG PACKAGE_ICON_256.PNG )
say "Done → $OUT_SPK"
ls -lh "$OUT_SPK"
sha256 "$OUT_SPK"
