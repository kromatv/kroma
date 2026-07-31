#!/usr/bin/env bash
# Upload one .ipa to TestFlight - or only prove that it could be.
#
# Inputs (step env):
#   IPA            path to the .ipa
#   PLATFORM       ios | tvos  - NOT cosmetic. App Store Connect record 6793457018
#                  carries iOS and tvOS as two platforms of one listing, and the
#                  flag is what tells it which half a build belongs to; a tvOS
#                  .ipa sent as `-t ios` is rejected outright.
#   MODE           upload (default) | validate. `validate` runs the same App
#                  Store checks an upload does - the class of rejection that
#                  appears AFTER a perfect archive/sign/export (a missing plist
#                  key, a bad entitlement) - without claiming a build number or
#                  notifying a single tester, so every candidate can carry the
#                  verdict instead of the promote step being first to learn it.
#   ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY   preferred
#   APPLE_ID / APPLE_PASSWORD                      fallback (app-specific password)
#
# Missing credentials are a SKIP, not a failure: the .ipa is already built and
# attached to the Release, and a beta-channel hiccup should not fail a release
# that has otherwise gone out.
set -euo pipefail

MODE="${MODE:-upload}"
case "$MODE" in
  upload) action=--upload-app ;;
  validate) action=--validate-app ;;
  *) echo "::error::MODE must be upload or validate, not '$MODE'"; exit 1 ;;
esac

[[ -f "$IPA" ]] || { echo "::error::no .ipa at $IPA"; exit 1; }

if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_PRIVATE_KEY:-}" ]]; then
  mkdir -p "$HOME/.appstoreconnect/private_keys"
  printf '%s' "$ASC_PRIVATE_KEY" \
    > "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
  trap 'rm -rf "$HOME/.appstoreconnect"' EXIT
  xcrun altool "$action" -f "$IPA" -t "$PLATFORM" \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" ]]; then
  xcrun altool "$action" -f "$IPA" -t "$PLATFORM" -u "$APPLE_ID" -p "$APPLE_PASSWORD"
else
  echo "No App Store Connect credentials; $IPA is built and attached, $MODE skipped."
  exit 0
fi
echo "altool $action ok: $(basename "$IPA") ($PLATFORM)"
