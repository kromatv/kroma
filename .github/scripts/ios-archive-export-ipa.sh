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
# it; a fixed path inside ios/ is what lets the next run reuse these objects.
# The whole archive step was a full rebuild of ~700 pod sources every time.
#
# The three flags below drop work that only an EDITOR needs:
#   COMPILER_INDEX_STORE_ENABLE  the index used for jump-to-definition
#   -skipPackagePluginValidation \ prompts that cannot be answered on a runner
#   -skipMacroValidation         / and are only asked because SPM macros are new
xcodebuild -workspace KROMA.xcworkspace -scheme KROMA \
  -configuration Release -sdk "$sdk" \
  -archivePath "$RUNNER_TEMP/KROMA.xcarchive" \
  -derivedDataPath build \
  -skipPackagePluginValidation -skipMacroValidation \
  COMPILER_INDEX_STORE_ENABLE=NO \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  -allowProvisioningUpdates "${auth[@]}" archive
cat > "$RUNNER_TEMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/KROMA.xcarchive" \
  -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist" \
  -exportPath "$RUNNER_TEMP/export" \
  -allowProvisioningUpdates "${auth[@]}"
rm -rf "$RUNNER_TEMP/asc"
mkdir -p "$GITHUB_WORKSPACE/out"
cp "$RUNNER_TEMP/export"/*.ipa \
  "$GITHUB_WORKSPACE/out/${artifact}-${VERSION}.ipa"
