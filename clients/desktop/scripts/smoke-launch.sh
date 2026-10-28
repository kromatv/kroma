#!/usr/bin/env bash
# Launch a built desktop app and fail if it exits within the window, printing
# what it wrote. Stopped once the window is over.
#
#   smoke-launch.sh <executable> [seconds]
set -euo pipefail

EXE="${1:?usage: smoke-launch.sh <executable> [seconds]}"
WINDOW="${2:-20}"
LOG="$(mktemp)"

set -m
"$EXE" >"$LOG" 2>&1 &
PID=$!
for _ in $(seq "$WINDOW"); do
  if ! kill -0 "$PID" 2>/dev/null; then
    status=0
    wait "$PID" || status=$?
    echo "smoke-launch: $EXE exited with $status within ${WINDOW}s:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 1
done
kill -- "-$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
echo "smoke-launch: $EXE stayed up ${WINDOW}s; its first lines:"
head -n 40 "$LOG"
