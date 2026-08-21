#!/usr/bin/env bash
# Resolve the one version every release artifact is stamped with, plus the
# channel.
#
# Inputs (step env):
#   EVENT_NAME    - github.event_name
#   VERSION_INPUT - workflow_dispatch `version` input (empty on other events)
# Outputs (GITHUB_OUTPUT): version, triplet, channel
set -euo pipefail

CHANNEL=none
if [[ "$EVENT_NAME" = "push" && "${GITHUB_REF_TYPE:-}" = "tag" ]]; then
  V="${GITHUB_REF_NAME#v}"            # tag v0.1.0 -> 0.1.0
  CHANNEL=stable
elif [[ "$EVENT_NAME" = "push" ]]; then
  # A push to main: build the version main is ALREADY on, as a release
  # CANDIDATE. Nothing is published - deploy.yml promotes one of these runs
  # after an approval, and the artifacts it publishes are the exact bytes this
  # run produced. That is what stops a broken pipeline from costing a version
  # number: fix, push, main rebuilds the same version, promote when it is good.
  V="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' server/Cargo.toml | head -1)"
  CHANNEL=candidate
elif [[ -n "$VERSION_INPUT" ]]; then
  V="$VERSION_INPUT"
else
  V="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' server/Cargo.toml | head -1)"
fi
T="${V%%-*}"                          # 0.1.0-rc1 -> 0.1.0 (TV manifests)
{
  echo "version=$V"
  echo "triplet=$T"
  echo "channel=$CHANNEL"
} >> "$GITHUB_OUTPUT"
echo "Version: $V (TV manifests: $T, channel: $CHANNEL)"
