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
the same upload identity from the secrets of the `release` environment, which
only `main` can read (see [`ci.md`](ci.md#secrets-only-main-can-read-them)):

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

The APKs on GitHub Releases remain for devices with no Play Store. Review
Google's automatic installer protection choice when creating the app: its
installer check prompts users of protected APKs from other sources to get the
app from Google Play.

## Beta enrolment

Google Play is the only Android channel kroma.tv offers. A closed-test app cannot
be found by searching, so a tester goes through two links:

1. <https://groups.google.com/g/kroma-android-beta>, the group the closed track
   grants access to.
2. <https://play.google.com/apps/testing/tv.kroma.app>, the opt-in page, which
   only works once the closed track is published.

An Android TV tester signs up on a phone or computer with the television's Google
account, then installs from the Play listing's device list.

## CI uploads

After the manual setup, configure a dedicated Google Play publisher service
account with access to this app's testing releases and the Android Publisher API.
Store its JSON credential as `PLAY_SERVICE_ACCOUNT_JSON` in the `release`
environment (`gh secret set PLAY_SERVICE_ACCOUNT_JSON --env release`). Set
repository variables:

- `PLAY_MOBILE_TRACK`: the mobile testing tracks, comma-separated.
- `PLAY_TV_TRACK`: the Android TV testing tracks, comma-separated, each prefixed `tv:`.
- `PLAY_STORE_READY=true` only after the app and its tracks are ready.

Track names must match the API; consult Google's
[form-factor track documentation](https://developers.google.com/android-publisher/tracks#ff-track-name).
A custom closed track keeps the name it was created with. The workflow refuses
`production` and `tv:production`. The upload action checks every name before it
uploads, and a name Play does not know fails the job with the list of the
app's tracks.

| Variable | Value today | Who gets each push to `main` |
| --- | --- | --- |
| `PLAY_MOBILE_TRACK` | `internal,alpha` | internal testers at once; the beta group (closed track "Alpha") after Google's review |
| `PLAY_TV_TRACK` | `tv:internal,tv:Android TV beta` | internal testers at once; the beta group (closed track "Android TV beta") after Google's review |

`_release-play.yml` waits for both Android artifacts and serializes uploads. A
push candidate, a stable release or a manual build run with `distribute` uploads
each bundle once and gives it to every track its variable names, as a finished
release, with no step in Play Console.

The workflow does not set `changesNotSentForReview`. This app sends its changes
for review automatically, and Play refuses a commit that sets it ("Changes are
sent for review automatically"). Without `PLAY_STORE_READY`, builds still
produce signed AAB artifacts, with no Play upload.

The key in use today belongs to the Firebase Admin service account of the
`kroma-media` Google Cloud project, where the Google Play Android Developer API
is on. In Play Console it has access to `tv.kroma.app` only, and may release to
and manage the testing tracks, never production.

## Older Android TV installs

Earlier native TV builds used `tv.kroma.tv`; the previous WebView shell used
`tv.kroma.androidtv`. The unified package installs alongside those apps. After
connecting the new app to the server, remove the old entry. This package change
does not migrate the old app's locally saved server/account settings.
