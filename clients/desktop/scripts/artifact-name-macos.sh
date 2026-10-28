#!/usr/bin/env bash
# Print KROMA_<version>_<arch>, the stem tauri's bundler gives every installer,
# from the version stamped into tauri.conf.json and this Mac's CPU.
set -euo pipefail

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' \
  "$DESKTOP/src-tauri/tauri.conf.json" | head -1)
case "$(uname -m)" in
  arm64 | aarch64) ARCH=aarch64 ;;
  x86_64) ARCH=x64 ;;
  *) ARCH=$(uname -m) ;;
esac
echo "KROMA_${VERSION:+${VERSION}_}${ARCH}"
