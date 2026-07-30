#!/usr/bin/env bash
# Sign + notarize the already-built .app, then package (and sign + notarize) the
# dmg. Runs in CI and by hand - see "Signing locally" below.
#
# Signing is INSIDE-OUT, not `codesign --deep`: Apple deprecates --deep for
# distribution signing (it applies the outer bundle's options to nested code
# instead of signing each item on its own terms, and silently skips items it
# doesn't recognise), a well-known source of notarization rejections. So every
# nested Mach-O (libmpv + its ffmpeg deps, from bundle-libmpv-macos.sh) is
# signed deepest-first, bundle last.
#
# Order matters twice: dylibbundler rewrites Mach-O load commands, invalidating
# any signature made before it ran; and the dmg must contain an app that is
# already signed, notarized AND stapled (stapling the dmg alone leaves the app
# inside it unstapled, so a Mac that copies it out and goes offline can't verify it).
#
# Inputs (env):
#   APPLE_SIGNING_IDENTITY  required to sign, e.g.
#                           "Developer ID Application: Name (TEAMID)"
#   SIGN                    "true" to sign; anything else = unsigned dmg only
#   APPLE_CERTIFICATE       base64 .p12, imported into a TEMPORARY keychain.
#                           Omit when the identity is already in your keychain
#                           (the local case).
#   APPLE_CERTIFICATE_PASSWORD  password for that .p12
#   APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID
#                           notarization credentials. APPLE_PASSWORD is an
#                           APP-SPECIFIC password from appleid.apple.com, not
#                           the Apple ID password. When unset, the artifacts are
#                           signed but NOT notarized (Gatekeeper still warns on
#                           another Mac) - useful for a fast local check.
#
# Signing locally, once a Developer ID Application cert is in your login
# keychain:
#   security find-identity -v -p codesigning     # copy the full identity string
#   bun run --filter '@kroma/desktop' tauri:build:mac
#   bash clients/desktop/scripts/bundle-libmpv-macos.sh \
#     clients/desktop/src-tauri/target/release/bundle/macos/KROMA.app
#   SIGN=true APPLE_SIGNING_IDENTITY="Developer ID Application: … (TEAMID)" \
#     APPLE_ID=… APPLE_PASSWORD=… APPLE_TEAM_ID=… \
#     bash .github/scripts/macos-sign-and-package-dmg.sh
set -euo pipefail

BUNDLE=clients/desktop/src-tauri/target/release/bundle
APP=$(find "$BUNDLE/macos" -maxdepth 1 -name '*.app' | head -n1)
if [[ -z "$APP" ]]; then
  echo "No .app in $BUNDLE/macos - build it first." >&2
  exit 1
fi

WORK=${RUNNER_TEMP:-$(mktemp -d)}
mkdir -p "$WORK"

SIGN=${SIGN:-false}
APPLE_SIGNING_IDENTITY=${APPLE_SIGNING_IDENTITY:-}
APPLE_CERTIFICATE=${APPLE_CERTIFICATE:-}
APPLE_ID=${APPLE_ID:-}
APPLE_PASSWORD=${APPLE_PASSWORD:-}
APPLE_TEAM_ID=${APPLE_TEAM_ID:-}

# Restore the previous default keychain - leaving a temp one as default is fine
# on a throwaway runner, not on a real Mac.
PREV_DEFAULT_KEYCHAIN=""
cleanup() {
  if [[ -n "$PREV_DEFAULT_KEYCHAIN" ]]; then
    security default-keychain -s "$PREV_DEFAULT_KEYCHAIN" 2>/dev/null || true
  fi
  if [[ -n "${KEYCHAIN:-}" && -f "$KEYCHAIN" ]]; then
    security delete-keychain "$KEYCHAIN" 2>/dev/null || true
  fi
  rm -f "$WORK/cert.p12"
}
trap cleanup EXIT

if [[ "$SIGN" = "true" ]]; then
  if [[ -z "$APPLE_SIGNING_IDENTITY" ]]; then
    echo "SIGN=true but APPLE_SIGNING_IDENTITY is unset." >&2
    exit 1
  fi
  # CI path: the cert arrives as a base64 .p12 and lives in a keychain we own.
  # Local path: the identity is already in the login keychain, so import nothing.
  if [[ -n "$APPLE_CERTIFICATE" ]]; then
    PREV_DEFAULT_KEYCHAIN=$(security default-keychain | tr -d ' "')
    KEYCHAIN="$WORK/kroma-sign.keychain-db"
    security create-keychain -p '' "$KEYCHAIN"
    security default-keychain -s "$KEYCHAIN"
    security unlock-keychain -p '' "$KEYCHAIN"
    # No timeout: notarization can outlast the 5-minute default and relock the
    # keychain mid-run, surfacing as "User interaction is not allowed" from codesign.
    security set-keychain-settings "$KEYCHAIN"
    echo "$APPLE_CERTIFICATE" | base64 --decode > "$WORK/cert.p12"
    security import "$WORK/cert.p12" -k "$KEYCHAIN" \
      -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '' "$KEYCHAIN" >/dev/null
  fi
fi

sign_one() {
  local target="$1"
  codesign --force --timestamp --options runtime \
    --sign "$APPLE_SIGNING_IDENTITY" "$target"
}

notarize() {
  local submission="$1"
  xcrun notarytool submit "$submission" \
    --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" --wait
}

can_notarize() {
  [[ -n "$APPLE_ID" && -n "$APPLE_PASSWORD" && -n "$APPLE_TEAM_ID" ]]
}

if [[ "$SIGN" = "true" ]]; then
  MAIN_EXEC=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")

  # `file` is the test rather than a *.dylib glob: the embedded ffmpeg tree has
  # versioned names (libavcodec.61.dylib) and extensionless binaries a glob misses.
  # `if`, not `a && b`: with `set -e` + `pipefail`, a non-matching grep would exit
  # the loop body - and the whole pipeline - non-zero on the first non-Mach-O file.
  find "$APP/Contents" -type f | while IFS= read -r f; do
    if file -b "$f" | grep -q 'Mach-O'; then printf '%s\n' "$f"; fi
  done | awk -F/ '{print NF"\t"$0}' | sort -rn | cut -f2- > "$WORK/nested.txt"

  COUNT=0
  while IFS= read -r f; do
    [[ "$f" = "$APP/Contents/MacOS/$MAIN_EXEC" ]] && continue # signed with the bundle
    sign_one "$f"
    COUNT=$((COUNT + 1))
  done < "$WORK/nested.txt"
  echo "Signed $COUNT nested binaries, deepest first."

  sign_one "$APP"

  # `--deep` is correct here even though it's wrong for signing: verification
  # is exactly when you want every nested item walked.
  codesign --verify --deep --strict --verbose=2 "$APP"
  echo "Signature verified: $APP"

  if can_notarize; then
    ditto -c -k --keepParent "$APP" "$WORK/app.zip"
    notarize "$WORK/app.zip"
    xcrun stapler staple "$APP"
    echo "Notarized + stapled: $APP"
  else
    echo "::warning::No APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID; signed but NOT notarized."
  fi
fi

mkdir -p "$BUNDLE/dmg"
DMG="$BUNDLE/dmg/KROMA_$(uname -m).dmg"
hdiutil create -volname KROMA -srcfolder "$APP" -ov -format UDZO "$DMG"

if [[ "$SIGN" = "true" ]]; then
  codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"
  if can_notarize; then
    notarize "$DMG"
    xcrun stapler staple "$DMG"
  fi
  # Advisory: `spctl` needs the notarized+stapled ticket to pass, so an
  # intentionally un-notarized local build reports rejection without failing the build.
  spctl -a -t open --context context:primary-signature -vv "$DMG" || \
    echo "::warning::spctl is not satisfied with $DMG (expected when un-notarized)."
fi

echo "Packaged: $DMG"
