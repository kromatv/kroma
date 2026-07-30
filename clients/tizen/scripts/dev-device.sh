#!/usr/bin/env bash
# KROMA Tizen on-device live-dev: serves the TV shell over the LAN with Vite HMR so
# a real Samsung TV hot-reloads on save. Needs `make dev-shell TV_IP=<tv-ip>` once,
# and the KROMA server running on the LAN.
set -euo pipefail

# Detected by lan-ip.sh, the same source of truth `make dev-shell` bakes into the
# shell, so the baked-in address and the HMR address match.
HOST_IP="${KROMA_TV_HOST:-$("$(dirname "$0")/lan-ip.sh")}"
if [[ -z "$HOST_IP" ]]; then
  echo "dev-device: could not detect a LAN IP." >&2
  echo "  Set it explicitly:  KROMA_TV_HOST=192.168.1.20 bun run dev:tizen:device" >&2
  exit 1
fi

echo "TV dev server → http://$HOST_IP:5174/   (seeds API → http://$HOST_IP:4040)"
echo "Needs: KROMA server running (bun run server:watch) + dev shell installed (make dev-shell)."

export KROMA_TV_DEVICE=1
export KROMA_TV_HOST="$HOST_IP"
# A fresh dev shell's initial server, since the TV cannot use localhost.
export VITE_KROMA_SERVER="${VITE_KROMA_SERVER:-http://$HOST_IP:4040}"

exec bun run --filter '@kroma/tizen' dev
