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
// WHY app.json's iOS BUNDLE ID SAYS `.mobile` ON A TELEVISION APP. Because it is
// not this app's identifier, it is the PRODUCT's: App Store Connect record
// 6793457018 carries both the iOS/iPadOS app and this one as two platforms of a
// single listing (Apple calls it a universal purchase), and Apple requires every
// platform in one record to share that record's bundle ID - which was minted for
// the phone app first. So `clients/mobile` and `clients/tv-native` both build
// `tv.kroma.mobile`, differing only in the SDK they are built against, and one
// device only ever sees one of them. Android is unaffected and stays
// `tv.kroma.tv`, because Play has no such notion and the two APKs are two apps.
// Splitting them again means two separate App Store listings, not a rename.

const { collectBuildInfo, productVersion } = require('../build-info');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');

module.exports = function tvNativeAppConfig({ config }) {
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
      versionCode: Number(process.env.KROMA_VERSION_CODE) || 1,
    },
    ios: {
      ...config.ios,
      // The same number, for the same reason, spelled the way Apple spells it:
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
};
