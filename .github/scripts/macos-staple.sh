#!/usr/bin/env bash
# Apple can accept notarization before its ticket service is reachable.
# Source this helper so both the app and its disk image use the same policy.
staple_and_validate() {
  local target="$1" attempt status
  for attempt in 1 2 3 4 5; do
    if xcrun stapler staple "$target" && xcrun stapler validate "$target"; then
      return 0
    else
      status=$?
    fi
    # EX_NOHOST (68): unexpected ticket-service response. Validation also
    # contacts that service. Invalid or revoked tickets must fail immediately.
    if [[ "$status" != 68 ]] || [[ "$attempt" = 5 ]]; then
      echo "::error::Stapling failed for $target (exit $status, attempt $attempt)." >&2
      return "$status"
    fi
    echo "::warning::Stapling failed for $target (exit $status); retrying in $((attempt * 10))s." >&2
    sleep "$((attempt * 10))"
  done
}
