#!/usr/bin/env bash
# A full SonarQube analysis on this machine, in about a minute.
#
# The CI scan is the gate but takes ~10 minutes and only runs on a push. This
# runs the SAME analyzers against a SonarQube Community container, so a rule
# that would fire in CI fires here first.
#
#   scripts/sonar-local.sh up       start the container (first run pulls ~1GB)
#   scripts/sonar-local.sh scan     analyse the working tree
#   scripts/sonar-local.sh issues   list what it found, newest analysis
#   scripts/sonar-local.sh down     stop and remove the container
#
# Differences from SonarCloud:
#   * Community edition has no PULL REQUEST analysis, so this scans the whole
#     tree rather than new code - compare against a scan of `main` if in doubt.
#   * Analyzer versions track the container image, not SonarCloud.
#   * The SonarCloud project key and organization are overridden on the command
#     line rather than edited, so nothing here can change what CI does.
#   * `sonar.sources=.` makes the indexer walk `node_modules`, which bun fills
#     with looping symlinks; the sources below are narrowed to real code dirs.
set -euo pipefail

CONTAINER=kroma-sonarqube
HOST_URL=http://localhost:9000
TOKEN_FILE="${HOME}/.kroma/sonarqube-local-token"
PROJECT_KEY=kroma-local
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }

up() {
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    docker start "$CONTAINER" >/dev/null
  else
    docker run -d --name "$CONTAINER" -p 9000:9000 \
      -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
      sonarqube:community >/dev/null
  fi
  printf 'waiting for SonarQube'
  until curl -sf "$HOST_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; do
    printf '.'; sleep 5
  done
  echo " up → $HOST_URL"
  [[ -f "$TOKEN_FILE" ]] || cat <<EOF

No token yet. Create one (the first login forces a password change):

  curl -su admin:admin -X POST '$HOST_URL/api/users/change_password?login=admin&previousPassword=admin&password=<new>'
  curl -su admin:<new> -X POST '$HOST_URL/api/user_tokens/generate?name=kroma-local' \\
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' > $TOKEN_FILE
EOF
}

scan() {
  [[ -f "$TOKEN_FILE" ]] || die "no token at $TOKEN_FILE - run '$0 up' and follow the instructions"
  curl -sf "$HOST_URL/api/system/status" >/dev/null 2>&1 || die "SonarQube is not up - run '$0 up'"

  # Coverage is optional: regenerating lcov costs more than the whole analysis.
  local coverage=()
  [[ -f "$REPO_ROOT/coverage/lcov.info" ]] && coverage+=("-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info")

  # Filtered by what actually EXISTS below: naming a directory that does not is
  # a hard "Invalid value of sonar.sources".
  local candidates=(
    .github/scripts
    clients/build-info clients/desktop/src clients/desktop/scripts clients/expo-build
    clients/mobile/src clients/synology clients/tizen clients/tv-build clients/tv-frame.vite.ts
    clients/tv-native clients/tv-web clients/web/src clients/webos
    packages scripts
    server/src server/crates server/modules server/xtask server/build.rs
    sonar-project.properties vitest.config.ts vitest.setup.ts package.json
  )
  local sources=""
  local candidate
  for candidate in "${candidates[@]}"; do
    [[ -e "$REPO_ROOT/$candidate" ]] || continue
    sources="${sources:+$sources,}$candidate"
  done
  [[ -n "$sources" ]] || die "no source directories found under $REPO_ROOT"

  docker run --rm \
    -e SONAR_HOST_URL="http://host.docker.internal:9000" \
    -e SONAR_TOKEN="$(cat "$TOKEN_FILE")" \
    -v "$REPO_ROOT:/usr/src" \
    sonarsource/sonar-scanner-cli \
    -Dsonar.projectKey="$PROJECT_KEY" \
    -Dsonar.organization= \
    -Dsonar.scm.disabled=true \
    -Dsonar.sources="$sources" \
    -Dsonar.exclusions="**/node_modules/**,**/dist/**,**/build/**,**/target/**,**/generated/**,**/*.gen.ts,**/__pycache__/**,**/.vite/**,**/*.min.js,**/vendor/**,**/*.png,**/*.PNG,**/*.jpg,**/*.jpeg,**/*.webp,**/*.gif,**/*.ico,**/*.icns,**/*.mp3,**/*.mp4,**/*.woff,**/*.woff2,**/*.ttf,**/*.otf,**/*.keystore,**/*.p12,**/*.lock" \
    "${coverage[@]}" \
    "$@"
}

issues() {
  [[ -f "$TOKEN_FILE" ]] || die "no token at $TOKEN_FILE"
  curl -su "$(cat "$TOKEN_FILE"):" \
    "$HOST_URL/api/issues/search?componentKeys=$PROJECT_KEY&resolved=false&ps=500" \
    | python3 -c '
import json, sys
d = json.load(sys.stdin)
total = d.get("total", 0)
print("open issues: %d" % total)
for i in d.get("issues", []):
    where = i["component"].split(":", 1)[-1]
    print("  %s:%s  %s [%s] %s" % (where, i.get("line"), i["rule"], i.get("severity"), i["message"][:110]))
'
}

case "${1:-}" in
  up) up ;;
  scan) shift; scan "$@" ;;
  issues) issues ;;
  down) docker rm -f "$CONTAINER" >/dev/null 2>&1 && echo "removed $CONTAINER" ;;
  *) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ; exit 1 ;;
esac
