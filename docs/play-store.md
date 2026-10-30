# KROMA on Google Play

KROMA mobile and Android TV belong to **one app**, `tv.kroma.app`, under the
KROMA TV developer profile. They have separate bundles and testing/release
tracks. Google recommends this arrangement in its
[Android TV distribution guide](https://developer.android.com/training/tv/publishing/distribute).

| | Mobile / tablet | Android TV / Google TV |
|---|---|---|
| Source | `clients/mobile` | `clients/tv-native` |
| Package | `tv.kroma.app` | `tv.kroma.app` |
| CI artifact | `kroma-mobile-aab` | `kroma-androidtv-aab` |
| Version code | `build × 10` | `build × 10 + 1` |
| Required device feature | Touchscreen | Leanback; no touchscreen requirement |

Apple's existing shared bundle ID and build numbers are unchanged. Android's
two version codes share one namespace, so both must be unique across tracks.

## Build and signing

Build & Release produces both APKs and Play-ready AABs. Both Android jobs restore
the same upload identity from the existing repository secrets:

- `ANDROID_KEYSTORE`: base64-encoded keystore.
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

The shared `@kromatv/android-build/plugin` configures release signing during Expo
prebuild. Credentials are read from environment variables by Gradle and are
never written into the generated project. Bundling without signing fails;
forks with no credentials can still build a debug-signed sideload APK.

Play App Signing's **app signing key** and the CI **upload key** are different
roles. For the first upload, choose the intended app signing identity for both
form factors. If Play generates a new app signing key, an APK signed only with
the upload key cannot update over the Play-installed app, or vice versa.

To build only the two Android clients, without distributing anything:

```sh
gh workflow run release.yml -R kromatv/kroma --ref <branch> -f targets=android -f distribute=false
```

## First setup in Play Console

1. Verify the account and `support@kroma.tv` contact/developer email.
2. Create one free **KROMA** app with package `tv.kroma.app`, default language
   English (US). Review the policy, Play App Signing and export declarations.
3. Upload the mobile AAB manually to the app's internal testing track. An app
   must have its first package uploaded in the console before API uploads work.
4. In **Test and release → Advanced settings → Form factors**, add Android TV
   and select its **dedicated release track**. Google says this track choice
   cannot be reversed. This is still the same store listing.
5. Add Android TV screenshots and the TV banner, then upload the TV AAB to its
   testing track. Complete the TV quality review opt-in when the listing is ready.
6. Complete the store listing, privacy policy (`https://kroma.tv/privacy`),
   app-access instructions, content rating, Data safety and the production-access
   testing requirements shown for this account before requesting publication.

For GitHub/Firebase distribution alongside Play, review Google's automatic
installer protection choice when creating the app: its installer check prompts
users of protected APKs from other sources to get the app from Google Play.

## CI uploads

After the manual setup, configure a dedicated Google Play publisher service
account with access to this app's testing releases and the Android Publisher API.
Store its JSON credential as `PLAY_SERVICE_ACCOUNT_JSON`. Set repository variables:

- `PLAY_MOBILE_TRACK`: the mobile testing-track ID returned by Play.
- `PLAY_TV_TRACK`: the dedicated TV testing-track ID, prefixed `tv:`.
- `PLAY_STORE_READY=true` only after the app and both tracks are ready.

Track names must match the API; consult Google's
[form-factor track documentation](https://developers.google.com/android-publisher/tracks#ff-track-name).
The workflow permits internal (`internal`/`qa`), alpha or beta testing tracks,
with the corresponding `tv:` prefix, and refuses production tracks.

`_release-play.yml` waits for both Android artifacts, serializes uploads and
creates **draft releases**, with changes not sent for review. A push candidate,
stable release or explicitly distributed manual build can prepare drafts.
Review and roll them out in Play Console. Without `PLAY_STORE_READY`, builds
still produce signed AAB artifacts, with no Play upload.

## Older Android TV installs

Earlier native TV builds used `tv.kroma.tv`; the previous WebView shell used
`tv.kroma.androidtv`. The unified package installs alongside those apps. After
connecting the new app to the server, remove the old entry. This package change
does not migrate the old app's locally saved server/account settings.
