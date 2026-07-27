#!/usr/bin/env bash
# Archive a prebuilt Apple project and export an App Store .ipa into ./out.
# Runs with the step's working-directory set to the generated `ios/` folder -
# clients/mobile/ios for the phone app, clients/tv-native/ios for Apple TV.
#
# Inputs (step env): APPLE_TEAM_ID, VERSION (full release version, names the
# .ipa), and the App Store Connect key trio ASC_KEY_ID / ASC_ISSUER_ID /
# ASC_PRIVATE_KEY.
#
# Optional, and the ONLY difference between the two callers - the projects are
# otherwise identical, both being `expo prebuild` output for the same bundle id:
#   SDK       `iphoneos` (default) or `appletvos`
#   ARTIFACT  base name of the .ipa, without the version or the extension
#
# BOTH APPS SIGN AS tv.kroma.mobile. That is not a copy-paste slip: App Store
# Connect record 6793457018 carries iOS and tvOS as two platforms of one listing,
# and Apple requires them to share a bundle id (see clients/tv-native/
# app.config.js). They differ by the SDK they are built against and nothing else,
# which is why one script covers both. The profile each one signs with does
# differ - an App Store profile is minted per platform - so the caller imports
# its own before this runs.
#
# The Expo template leaves the project on AUTOMATIC signing, so xcodebuild has
# to resolve the App Store profile itself. `-allowProvisioningUpdates` can only
# do that when it is authenticated, hence the API key: without it the archive
# fails with "no profile matching tv.kroma.mobile". The certificate and profile
# imported by the previous step still cover the case where the key is absent.
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

# -derivedDataPath puts the build products somewhere the workflow can CACHE.
# Xcode's default is a hashed folder under ~/Library/Developer/Xcode/DerivedData
# whose name changes with the workspace path, so nothing could be restored into
# it. The whole archive step was a full rebuild of ~700 pod sources every time.
#
# It must land OUTSIDE ios/, which is why the caller passes an absolute path.
# `expo prebuild` deletes and regenerates ios/, so anything kept in there is
# rebuilt from nothing on any run that regenerates - and, more subtly, the two
# have different cache lifetimes: the generated project is immutable for a given
# config, while these objects change on every commit. One cache entry cannot
# serve both, because actions/cache does not re-save a key that already hit.
derived="${DERIVED_DATA:-build}"
#
# The three flags below drop work that only an EDITOR needs:
#   COMPILER_INDEX_STORE_ENABLE  the index used for jump-to-definition
#   -skipPackagePluginValidation \ prompts that cannot be answered on a runner
#   -skipMacroValidation         / and are only asked because SPM macros are new
# MANUAL signing.
#
# Automatic signing does not merely pick the wrong profile - it MINTS. Given
# `-allowProvisioningUpdates` and an API key it ignores the App Store profile
# installed a step earlier, creates itself a fresh "Apple Development: Created
# via API" certificate and a "Team Provisioning Profile", and signs with those.
# The archive then succeeds and only the App Store export fails, blaming the
# profile. Ten such certificates accumulated over one week of failed runs until
# the account hit Apple's ceiling and NOTHING could sign: "Choose a certificate
# to revoke. Your account has reached the maximum number of certificates."
#
# Every installed profile is read for its bundle id and name, so a target is
# always matched to the profile that actually covers it and the two can never
# disagree. An app with an extension has more than one: the Apple TV app builds
# KROMA and KromaTopShelf under different bundle ids, and Apple issues a profile
# per bundle id.
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
    # Pin the target whose PRODUCT_BUNDLE_IDENTIFIER matches. A profile covering
    # a bundle id this project does not build is simply skipped, which is what
    # lets one installed set serve both the phone and the television.
    if grep -q "PRODUCT_BUNDLE_IDENTIFIER = ${pbundle};" KROMA.xcodeproj/project.pbxproj; then
      python3 "$GITHUB_WORKSPACE/.github/scripts/pin-target-signing.py" \
        KROMA.xcodeproj/project.pbxproj "$pbundle" "$pname"
    else
      echo "  (no target builds $pbundle here; skipping)"
    fi
  done
  [[ ${#map_entries[@]} -gt 0 ]] || { echo "::error::MANUAL_SIGNING=1 but no profiles installed"; exit 1; }
  # No -allowProvisioningUpdates: that flag IS the licence to invent a
  # certificate, and nothing here should ever create one again.
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
