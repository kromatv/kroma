#!/usr/bin/env bash
# Import the Apple Distribution identity + the App Store provisioning profile
# into a throwaway keychain so xcodebuild can sign the mobile .ipa.
#
# Inputs (step env): IOS_CERTIFICATE, IOS_CERTIFICATE_PASSWORD, IOS_PROFILE, and
# optionally IOS_PROFILE_EXTRA - a SECOND profile, for an app that ships an app
# extension. The Apple TV app builds two targets (KROMA and KromaTopShelf) whose
# bundle ids differ, and Apple issues a profile per bundle id, so one profile can
# never cover both.
#
# IOS_PROFILE_FILE / IOS_PROFILE_EXTRA_FILE name a base64 file minted earlier in
# the job and TAKE PRECEDENCE over the matching secret. A stored profile is a
# derived artifact that goes stale whenever the App ID's capabilities change, so
# the freshly minted one is the answer whenever there is one; the secret remains
# the fallback for a run with no App Store Connect key.
set -euo pipefail

kc="$RUNNER_TEMP/kroma-ios.keychain-db"
pw=$(uuidgen)
security create-keychain -p "$pw" "$kc"
security set-keychain-settings -lut 21600 "$kc"
security unlock-keychain -p "$pw" "$kc"
echo "$IOS_CERTIFICATE" | base64 --decode > "$RUNNER_TEMP/ios-cert.p12"
security import "$RUNNER_TEMP/ios-cert.p12" -k "$kc" -P "$IOS_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$pw" "$kc" >/dev/null
security list-keychain -d user -s "$kc" login.keychain-db
dir="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$dir"

# Installed under the profile's own UUID, which is the name Xcode looks a profile
# up by. The previous fixed `kroma.mobileprovision` worked only while there was
# exactly one; a second profile written to the same path would have silently
# replaced the first, and the extension would have gone unsigned.
install_profile() {
  local b64="$1" tmp uuid name
  [[ -n "$b64" ]] || return 0
  tmp=$(mktemp)
  printf '%s' "$b64" | base64 --decode > "$tmp"
  security cms -D -i "$tmp" > "$tmp.plist" 2>/dev/null \
    || { echo "::error::a provisioning profile secret is not a .mobileprovision"; exit 1; }
  uuid=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$tmp.plist")
  name=$(/usr/libexec/PlistBuddy -c 'Print :Name' "$tmp.plist")
  cp "$tmp" "$dir/$uuid.mobileprovision"
  echo "installed '$name' ($uuid)"
  rm -f "$tmp" "$tmp.plist"
}

# A minted file wins over the secret of the same name.
profile_or_secret() {
  local file="$1" secret="$2"
  if [[ -n "$file" && -s "$file" ]]; then
    printf '%s' "$(cat "$file")"
  else
    printf '%s' "$secret"
  fi
}

install_profile "$(profile_or_secret "${IOS_PROFILE_FILE:-}" "${IOS_PROFILE:-}")"
install_profile "$(profile_or_secret "${IOS_PROFILE_EXTRA_FILE:-}" "${IOS_PROFILE_EXTRA:-}")"
rm -f "$RUNNER_TEMP/ios-cert.p12"
