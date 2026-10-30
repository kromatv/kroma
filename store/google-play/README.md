# Google Play store assets

One listing for `tv.kroma.app`, with separate mobile and Android TV releases.

The listing copy and uploadable PNGs use the Fastlane metadata layout under
[`fastlane/metadata/android`](../../fastlane/metadata/android). Both `en-US` and
`fr-FR` contain:

| Asset | Size |
| --- | --- |
| App icon | 512 × 512 |
| Feature graphic | 1024 × 500 |
| TV banner | 1280 × 720 |
| Three phone screenshots | 1440 × 2560, 9:16 |
| Three TV screenshots | 1920 × 1080, 16:9 |

The three screenshots tell a sequence: movie collection, movie details,
and series with episodes. French exports have French marketing
captions and the same English app captures. The metadata explains that KROMA
requires a compatible server and the user's own media.

## Rebuild

From the repository root:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun clients/tv-build/play-store-art.ts
```

The exporter uses the existing KROMA vector lockup, app icon, self-hosted
Bricolage Grotesque and Hanken Grotesk fonts, and design tokens. Chromium renders
the fixed store canvases without a web server or an external design service.

## Native captures

`captures/android-phone` contains original 1080 × 2400 PNGs from the current
Android release build on an Android 14 emulator. The app connects to an isolated
built-in demo catalogue and a fictional profile, with no household account or
private library. The artwork is the demo catalogue's TMDB metadata; those titles
are examples of a personal library and are not included with KROMA.

The export places each native capture in a simple frame and crops the Android
system status/navigation bars. The app's interface and data are preserved.

`tvScreenshots` in each language holds three 1920 × 1080 captures from a release
build on a Google TV emulator. They come from a throwaway server whose library
is only Blender open movies, so no commercial artwork reaches the listing. Short
test clips stand in for the films, with their runtimes set by hand. The phone
images belong only in the phone slots.

## Console upload

Upload the default English metadata and images first, then add the French
translation. Keep the screenshots in their numbered order. These files prepare
the listing; they do not publish a release or enroll testers.
