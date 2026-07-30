#!/usr/bin/env bash
# Archive a prebuilt Apple project and export an App Store .ipa into ./out. Runs
# from the generated `ios/` folder. Env: APPLE_TEAM_ID, VERSION, the ASC key trio
# (ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY), and optionally SDK (`iphoneos`
# or `appletvos`) + ARTIFACT.
#
# Both apps sign as tv.kroma.mobile: App Store Connect record 6793457018 carries
# iOS and tvOS as two platforms of one listing, and Apple requires them to share a
# bundle id. They differ only by the SDK, so one script covers both; the App Store
# profile is per platform, and the caller imports its own before this runs.
#
# The Expo template leaves the project on AUTOMATIC signing, so xcodebuild resolves
# the profile itself; `-allowProvisioningUpdates` only does that authenticated,
# hence the API key - without it the archive fails with "no profile matching".
set -euo pipefail

sdk="${SDK:-iphoneos}"
artifact="${ARTIFACT:-KROMA-mobile}"

auth=()
if [[ -n "${ASC_KEY_ID:-}" ]] && [[ -n "${ASC_ISSUER_ID:-}" ]] && [[ -n "${ASC_PRIVATE_KEY:-}" ]]; then
  mkdir -p "$RUNNER_TEMP/asc"
  printf '%s' "$ASC_PRIVATE_KEY" > "$RUNNER_TEMP/asc/AuthKey_${ASC_KEY_ID}.p8"
  auth=(-authenticationKeyPath "$RUNNER_TEMP/asc/AuthKey_${ASC_KEY_ID}.p8"
        -authenticationKeyID "$ASC_KEY_ID"
        -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

# -derivedDataPath puts the build products somewhere actions/cache can restore
# into; Xcode's default folder name is a hash of the workspace path. It must land
# OUTSIDE ios/, which `expo prebuild` deletes and regenerates - hence the caller's
# absolute path.
derived="${DERIVED_DATA:-build}"
# Automatic signing does not merely pick the wrong profile - it MINTS. Given
# `-allowProvisioningUpdates` and an API key it ignores the installed App Store
# profile and creates itself an "Apple Development: Created via API" certificate,
# until the account hits Apple's certificate ceiling and nothing can sign at all.
# Manual signing instead maps every installed profile to the target whose bundle
# id it covers (the Apple TV app builds KROMA and KromaTopShelf under two ids).
sign=(-allowProvisioningUpdates "${auth[@]}")
export_signing="automatic"
declare -a map_entries=()
profiles_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
if [[ "${MANUAL_SIGNING:-}" = "1" ]]; then
  shopt -s nullglob
  for p in "$profiles_dir"/*.mobileprovision; do
    security cms -D -i "$p" > "$RUNNER_TEMP/p.plist" 2>/dev/null || continue
    pname=$(/usr/libexec/PlistBuddy -c 'Print :Name' "$RUNNER_TEMP/p.plist")
    pbundle=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' \
      "$RUNNER_TEMP/p.plist" | cut -d. -f2-)
    echo "manual signing: '$pname' covers $pbundle"
    map_entries+=("  <key>${pbundle}</key><string>${pname}</string>")
    # A profile covering a bundle id this project does not build is skipped, which
    # is what lets one installed set serve both the phone and the television.
    if grep -q "PRODUCT_BUNDLE_IDENTIFIER = ${pbundle};" KROMA.xcodeproj/project.pbxproj; then
      python3 "$GITHUB_WORKSPACE/.github/scripts/pin-target-signing.py" \
        KROMA.xcodeproj/project.pbxproj "$pbundle" "$pname"
    else
      echo "  (no target builds $pbundle here; skipping)"
    fi
  done
  [[ ${#map_entries[@]} -gt 0 ]] || { echo "::error::MANUAL_SIGNING=1 but no profiles installed"; exit 1; }
  # No -allowProvisioningUpdates: that flag is the licence to invent a certificate.
  sign=(CODE_SIGN_STYLE=Manual)
  export_signing="manual"
fi

xcodebuild -workspace KROMA.xcworkspace -scheme KROMA \
  -configuration Release -sdk "$sdk" \
  -archivePath "$RUNNER_TEMP/KROMA.xcarchive" \
  -derivedDataPath "$derived" \
  -skipPackagePluginValidation -skipMacroValidation \
  COMPILER_INDEX_STORE_ENABLE=NO \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  "${sign[@]}" archive

profile_map=""
if [[ "$export_signing" = "manual" ]]; then
  profile_map="  <key>provisioningProfiles</key>
  <dict>
$(printf '%s\n' "${map_entries[@]}")
  </dict>"
fi
cat > "$RUNNER_TEMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>uploadSymbols</key><true/>
  <key>signingStyle</key><string>${export_signing}</string>
${profile_map}
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/KROMA.xcarchive" \
  -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist" \
  -exportPath "$RUNNER_TEMP/export" \
  "${auth[@]}"
rm -rf "$RUNNER_TEMP/asc"
mkdir -p "$GITHUB_WORKSPACE/out"
cp "$RUNNER_TEMP/export"/*.ipa \
  "$GITHUB_WORKSPACE/out/${artifact}-${VERSION}.ipa"
