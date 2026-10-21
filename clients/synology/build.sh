#!/usr/bin/env bash
# Build a single self-contained KROMA Synology package (.spk) for x86_64 DSM 7:
# kroma-server (also serving the web SPA) + ffmpeg/ffprobe and the libraries they share.
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
# ONE version shape, nightly and stable alike: `X.Y.Z.BUILD`, the build in a 4th
# FEATURE segment. There used to be a second one - the catalog rewrote this to
# `X.Y.Z-BUILD` before advertising it - and two shapes for one build is what
# broke the Update button: DSM compares the dotted FEATURE version, so an
# installed `0.1.38.3480473` outranked every `0.1.38-*` on offer and Package
# Center concluded there was nothing newer. Nothing rewrites it now.
#
# The 4th segment is what makes this work with NO version bump: nightlies share
# one X.Y.Z, and a build in the feature version orders them against each other
# and against what is already installed. Synology's INFO spec allows it - the
# delimiters are `.`, `-` and `_`, every delimited component must be a number,
# and each is bounded by 2^31-1, which a minutes-since-2020 build clears.
#
# THE RULE: the version must only ever go UP, and BUILD carries that on its own,
# so X.Y.Z does NOT have to move between nightlies. Keep BUILD as minutes since
# 2020-01-01 UTC - shrinking its magnitude (minutes to days) once made every new
# build read as a downgrade. Override with BUILD=...
#
# DSM installs a manual .spk over an existing one only when the new version is
# strictly greater, and reports a refusal as the misleading webapi 4521 "invalid
# file format". A build inside the feature version satisfies that check too, so
# the manual path and the package-source path agree.
BUILD="${BUILD:-$(( ( $(date -u +%s) - 1577836800 ) / 60 ))}"
ARCH="x86_64"
TARGET="x86_64-unknown-linux-musl"
# Digest-pinned: a moving tag swaps rustc underneath and invalidates every cached
# build artifact (CI caches server/target across runs).
RUST_IMAGE="${RUST_IMAGE:-messense/rust-musl-cross:x86_64-musl@sha256:ce75e9174325d4fbb3de85c309e2d7ca29f7500169bc4b5d2c611ff7e86d549a}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Read here and handed to the cross-build: inside the container git sees a
# checkout owned by nobody it knows and refuses to answer, which is why every
# published build reported an unknown commit.
GIT_HASH="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
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
  # No feature flags: transcription is the whisper sidecar's, and its `.kmod`
  # picks the candle backend itself.
  # The WHOLE repo is mounted, not server/ alone: i18n.rs `include_str!`s the
  # shared locale catalogs at ../../packages/core/src/locales/*.json, and the
  # server path-deps three modules at ../modules/<id>/server — both outside
  # server/, so anything narrower leaves a path dangling.
  docker run --rm -v "$ROOT":/home/rust/repo -w /home/rust/repo/server \
    -v "$CACHE/cargo":/root/.cargo/registry \
    -e KROMA_GIT_HASH="$GIT_HASH" \
    -e KROMA_VERSION="$VERSION" \
    -e KROMA_BUILD="$BUILD" \
    "$RUST_IMAGE" cargo build --release --target "$TARGET"
fi
[ -f "$BIN" ] || { echo "musl binary missing: $BIN"; exit 1; }

# BtbN's GPL shared build, pinned in ffmpeg.lock and mirrored on our own
# vendor release: it is the one configured with `--enable-vaapi --enable-libvpl`,
# so a DSM box with an Intel iGPU (DS918+, DS920+, DS423+ ...) reaches its
# QuickSync encoder, and ffmpeg and ffprobe share one set of libraries.
FF="$WORK/ffmpeg"
say "Fetching ffmpeg/ffprobe (ffmpeg.lock)"
"$ROOT/clients/synology/fetch-ffmpeg.sh" x86_64 "$FF" "$CACHE/ffmpeg"

# Whether this package can transcode on an iGPU. The pinned build has the encoders,
# so losing them means ffmpeg.lock moved to one without: fatal, since a CPU-only
# package would quietly put every 4K downscale on the NAS's CPU. The payload is
# a Linux binary, so only a Linux build host can be asked.
if ! "$FF/bin/ffmpeg" -version >/dev/null 2>&1; then
  say "Skipping the encoder check: the payload is a Linux binary and this host cannot run it"
elif "$FF/bin/ffmpeg" -hide_banner -encoders 2>/dev/null | grep -qE 'h264_(vaapi|qsv)'; then
  say "ffmpeg carries the Intel hardware encoders (QuickSync/VAAPI)"
else
  echo "this ffmpeg has no hardware H.264 encoder (h264_vaapi / h264_qsv)"
  exit 1
fi

say "Staging payload"
PAY="$WORK/payload"
mkdir -p "$PAY/bin" "$PAY/web"
install -m755 "$BIN" "$PAY/bin/kroma-server"
cp -R "$ROOT/clients/web/dist/client/." "$PAY/web/"
cp -R "$FF" "$PAY/ffmpeg"
# Strip macOS xattrs so bsdtar doesn't embed SCHILY.xattr pax records that DSM's
# busybox tar can reject. COPYFILE_DISABLE stops AppleDouble.
xattr -cr "$PAY" 2>/dev/null || true
# xz, as Synology's own pkgscripts-ng packs package.tgz (`tar cJf`): a quarter
# smaller than gzip, for a 65 MiB decoder at -9e.
( cd "$PAY" && COPYFILE_DISABLE=1 tar "${TAR_CLEAN[@]}" -cf - . ) | xz -9e -T0 > "$WORK/package.tgz"

say "Assembling .spk"
SPK="$WORK/spk"
mkdir -p "$SPK"
cp -R "$SKEL/scripts" "$SKEL/conf" "$SKEL/WIZARD_UIFILES" "$SPK/"
chmod 755 "$SPK/scripts/"*
cp "$WORK/package.tgz" "$SPK/package.tgz"
# INFO extractsize is read in KB on DSM 6+; bytes made DSM believe the package
# needed ~190 GB after extraction.
EXT_SIZE="$(( $(xz -dc "$WORK/package.tgz" | wc -c | tr -d ' ') / 1024 ))"
# Nightlies share one X.Y.Z, so BUILD is what orders them (see the note above).
# Stamped ONCE: deploy.yml promotes a nightly .spk as-is into the stable Release,
# which is the other reason there is only one shape to stamp.
INFO_VERSION="$VERSION.$BUILD"
sed -e "s/@INFO_VERSION@/$INFO_VERSION/g" -e "s/@ARCH@/$ARCH/g" -e "s/@SIZE@/$EXT_SIZE/g" \
  "$SKEL/INFO.template" > "$SPK/INFO"
say "DSM package version: $INFO_VERSION (X.Y.Z orders releases, the 4th segment orders every build within one)"
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
