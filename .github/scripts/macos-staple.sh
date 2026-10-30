#!/usr/bin/env bash
# Apple can accept notarization before its ticket service is reachable.
# Source this helper so both the app and its disk image use the same policy.
staple_warning() {
  echo "::warning::$1" >&2
  echo "- $1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

# notarytool's --wait returns once the submission settles, whatever the verdict.
require_accepted() {
  local target="$1" result="$2"
  if [[ ! "$result" =~ \"status\"[[:space:]]*:[[:space:]]*\"Accepted\" ]]; then
    echo "::error::Notarization of $target was not accepted: $result" >&2
    return 1
  fi
}

staple_and_validate() {
  local target="$1" action=staple status delay
  for delay in 15 30 60 120 120 120 120 0; do
    status=0
    if [[ "$action" = staple ]]; then
      if xcrun stapler staple "$target"; then action=validate; else status=$?; fi
    fi
    if [[ "$action" = validate ]]; then
      if xcrun stapler validate "$target"; then return 0; else status=$?; fi
    fi
    # EX_NOHOST (68): unexpected ticket-service response. Validation also
    # contacts that service. Invalid or revoked tickets must fail immediately.
    if [[ "$status" != 68 ]]; then
      echo "::error::Stapling failed for $target (exit $status)." >&2
      return "$status"
    fi
    (( delay )) || break
    echo "::warning::Ticket service unreachable during $action of $target; retrying in ${delay}s." >&2
    sleep "$delay"
  done
  if [[ "$action" = validate ]]; then
    staple_warning "$target has its ticket, but Apple's ticket service never confirmed it."
  else
    staple_warning "$target is notarized but UNSTAPLED: Apple's ticket service stayed unreachable, so its first launch needs a network."
  fi
}
