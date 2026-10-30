// The dynamic half of the native TV app's Expo config.
//
// app.json still holds everything static and is the file to edit; this adds the
// one thing a JSON file cannot state - which build this is (git commit, branch,
// compile time, repository), for the About screen.
//
// The VERSION is the product's, not this package's: the browser TV shells report
// `server/Cargo.toml`'s version (see clients/tv-build/shell.ts), and the native
// TV app is the same client compiled differently, so it must not disagree with
// its own siblings about what version it is.
//
// WHY app.json's iOS BUNDLE ID IS THE PHONE APP'S TOO. Because it is not this
// app's identifier, it is the PRODUCT's: one App Store Connect record carries
// both the iOS/iPadOS app and this one as two platforms of a single listing
// (Apple calls it a universal purchase), and Apple requires every platform in one
// record to share that record's bundle ID. Android also shares `tv.kroma.app`:
// one Play listing has a mobile track and a dedicated Android TV track, with
// separate bundles, the same signing identity, and unique version codes.

import path from 'node:path';
import { androidVersionCode } from '@kromatv/android-build';
import { collectBuildInfo, productVersion } from '@kromatv/build-info';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const repoRoot = path.join(__dirname, '..', '..');

export default function tvNativeAppConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  return {
    ...config,
    // The product version, for the same reason the About screen reports it: a
    // build that calls itself 0.1.3 while its siblings are 0.2.0 is a support
    // question nobody can answer. app.json's `version` is the fallback for a
    // checkout with no server manifest to read.
    version: productVersion(repoRoot) || config.version,
    android: {
      ...config.android,
      // Monotonic across releases, supplied by the release workflow (minutes since
      // 2020). Play and `adb install -r` both refuse a build whose code did not
      // increase, so a local build keeps 1 and only CI mints real ones.
      versionCode: process.env.KROMA_VERSION_CODE
        ? androidVersionCode(Number(process.env.KROMA_VERSION_CODE), 'tv')
        : 1,
    },
    ios: {
      ...config.ios,
      // Apple's original CI build number, without Android's form-factor suffix:
      // App Store Connect rejects a (version, build) pair it has already seen, so
      // a release that reuses one is refused AFTER the twenty minutes it took to
      // archive it. tvOS and iOS count separately - a record's platforms do not
      // share a build-number namespace - so this is free to be minted the same
      // way `clients/mobile` mints its own.
      buildNumber: String(Number(process.env.KROMA_VERSION_CODE) || 1),
    },
    extra: {
      ...config.extra,
      buildInfo: collectBuildInfo(__dirname, { version: productVersion(repoRoot) }),
    },
  };
}
