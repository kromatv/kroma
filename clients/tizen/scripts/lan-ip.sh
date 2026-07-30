#!/usr/bin/env bash
# This machine's LAN IPv4, the address the TV connects back to. Single source of
# truth for the Makefile (HOST_IP) and dev-device.sh; keep vite.config.ts lanIp()
# in sync. Callers override with KROMA_TV_HOST when en0/en1 is the wrong one.
ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
