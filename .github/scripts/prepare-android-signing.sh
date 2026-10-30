#!/usr/bin/env bash
# Restore the same upload identity for both form factors. No secrets reach files
# in the checkout, command-line arguments, or generated Gradle source.
set -euo pipefail

names=(ANDROID_KEYSTORE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD)
present=0
for name in "${names[@]}"; do
  [[ -z "${!name:-}" ]] || present=$((present + 1))
done
if [[ "$present" = 0 ]]; then
  echo 'No Android signing credentials; only the sideloadable APK will be built.'
  echo 'ready=false' >> "$GITHUB_OUTPUT"
  exit 0
fi
[[ "$present" = 4 ]] || { echo '::error::Android signing credentials are incomplete'; exit 1; }

store="$RUNNER_TEMP/kroma-upload.keystore"
umask 077
printf '%s' "$ANDROID_KEYSTORE" | base64 --decode > "$store"
keytool -list -keystore "$store" -storepass:env ANDROID_KEYSTORE_PASSWORD \
  -alias "$ANDROID_KEY_ALIAS" >/dev/null
{
  echo 'ready=true'
  echo "keystore_path=$store"
} >> "$GITHUB_OUTPUT"
