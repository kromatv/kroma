#!/usr/bin/env bash
# Builds the ffmpeg KROMA ships: FFmpeg's release tarball, configured with only
# what the server and its modules invoke (configure.args, plus the arch's own
# file), compiled in BtbN's builder image so it links the same prebuilt
# libraries against the same old-glibc toolchain. Writes
# <out>/ffmpeg-<version>-kroma-<arch>.tar.xz, laid out the way fetch-ffmpeg.sh
# reads it: <dir>/bin/{ffmpeg,ffprobe}, <dir>/lib/*.so.N. On x86_64 the
# tarball also carries libva, which ffmpeg loads from the host at runtime and
# which a NAS does not have: built here too, so it is as recent as the headers
# ffmpeg was compiled against and as old-glibc as the rest.
# Usage: build.sh <x86_64|aarch64> <out-dir>
set -euo pipefail

ARCH="$1"
OUT="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="8.1.3"
SOURCE="https://ffmpeg.org/releases/ffmpeg-$VERSION.tar.xz"
SOURCE_SHA="7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3"
LIBVA_VERSION="2.24.1"
LIBVA_SOURCE="https://github.com/intel/libva/archive/refs/tags/$LIBVA_VERSION.tar.gz"
LIBVA_SHA="0b4a3649ee8d683b9cce2ef094df4fb039d276c0cef7e49337c43d3b297b9f42"

# Both images are x86_64 hosts: the aarch64 one cross-compiles.
case "$ARCH" in
  x86_64)
    IMAGE="ghcr.io/btbn/ffmpeg-builds/linux64-gpl-shared@sha256:15a08979e1c135cd82fbc0c75f424eee6d0536e90bf1a0b1bffb60272ee0be99"
    ;;
  aarch64)
    IMAGE="ghcr.io/btbn/ffmpeg-builds/linuxarm64-gpl-shared@sha256:4dcb5f9107539a5bbce1a2ebc7cc2472cec78b9955a83ce50d5fa2b09abc10e9"
    ;;
  *)
    echo "unknown arch $ARCH"
    exit 1
    ;;
esac

sha256() {
  local file="$1"
  if command -v shasum >/dev/null; then shasum -a 256 "$file"; else sha256sum "$file"; fi | cut -d' ' -f1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
curl -fsSL --show-error --retry 3 --proto '=https' "$SOURCE" -o "$WORK/ffmpeg.tar.xz"
[[ "$(sha256 "$WORK/ffmpeg.tar.xz")" == "$SOURCE_SHA" ]] || { echo "ffmpeg source does not match its pin"; exit 1; }
if [[ "$ARCH" == x86_64 ]]; then
  curl -fsSL --show-error --retry 3 --proto '=https' "$LIBVA_SOURCE" -o "$WORK/libva.tar.gz"
  [[ "$(sha256 "$WORK/libva.tar.gz")" == "$LIBVA_SHA" ]] || { echo "libva source does not match its pin"; exit 1; }
fi
grep -hv '^\s*$' "$HERE/configure.args" "$HERE/configure.$ARCH.args" > "$WORK/configure.args"

NAME="ffmpeg-$VERSION-kroma-$ARCH"
cat > "$WORK/build.sh" <<'SCRIPT'
set -euo pipefail
mkdir -p /build
cd /build
# Python's tarfile, not tar: GNU tar fails to create a single file in this
# image under Rosetta's x86_64 emulation, which is how a Mac builds it.
python3 -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(".")' /work/ffmpeg.tar.xz
cd "ffmpeg-$VERSION"
mapfile -t ARGS < /work/configure.args
# BtbN's escaping, verbatim: configure, make and the shell each take a layer,
# and the linker has to see the literal $ORIGIN the loader resolves.
./configure --prefix=/build/prefix --pkg-config-flags=--static $FFBUILD_TARGET_FLAGS "${ARGS[@]}" \
  --extra-cflags="$FF_CFLAGS" --extra-cxxflags="$FF_CXXFLAGS" --extra-libs="$FF_LIBS" \
  --extra-ldflags="$FF_LDFLAGS" --extra-ldexeflags='-Wl,-rpath,\\\$\$ORIGIN/../lib' \
  --cc="$CC" --cxx="$CXX" --ar="$AR" --ranlib="$RANLIB" --nm="$NM" \
  --extra-version=kroma || { tail -50 ffbuild/config.log; exit 1; }
make -j"$(nproc)"
make install
mkdir -p "/build/$NAME/bin" "/build/$NAME/lib"
cp /build/prefix/bin/ffmpeg /build/prefix/bin/ffprobe "/build/$NAME/bin/"
for lib in /build/prefix/lib/lib*.so.*; do
  case "$lib" in *.so.[0-9] | *.so.[0-9][0-9]) cp -L "$lib" "/build/$NAME/lib/" ;; esac
done
if [[ -f /work/libva.tar.gz ]]; then
  cd /build
  python3 -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(".")' /work/libva.tar.gz
  printf "[binaries]\nc = '%s'\nar = '%s'\npkg-config = 'pkg-config'\n[host_machine]\nsystem = 'linux'\ncpu_family = 'x86_64'\ncpu = 'x86_64'\nendian = 'little'\n" \
    "$CC" "$AR" > /build/cross.txt
  meson setup /build/libva-build "/build/libva-$LIBVA_VERSION" --cross-file /build/cross.txt \
    --prefix=/build/libva --buildtype=release -Dwith_x11=no -Dwith_glx=no -Dwith_wayland=no -Denable_docs=false
  ninja -C /build/libva-build install
  cp -L /build/libva/lib/libva.so.2 /build/libva/lib/libva-drm.so.2 "/build/$NAME/lib/"
fi
"${CC%gcc}strip" "/build/$NAME/bin/"* "/build/$NAME/lib/"*
tar -C /build -cf - "$NAME" | xz -T0 -9 > "/work/$NAME.tar.xz"
SCRIPT

docker run --rm --platform linux/amd64 -e VERSION="$VERSION" -e NAME="$NAME" -e LIBVA_VERSION="$LIBVA_VERSION" -v "$WORK":/work "$IMAGE" bash /work/build.sh
mkdir -p "$OUT"
cp "$WORK/$NAME.tar.xz" "$OUT/"
echo "$(sha256 "$OUT/$NAME.tar.xz")  $NAME.tar.xz"
