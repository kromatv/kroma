// Gives the app a dynamic Top Shelf: the shortcut cards the Apple TV home
// screen shows above the icon when it is focused in the top row.
//
// The cards come from a Top Shelf APP EXTENSION - a separate binary the system
// queries on focus - and `expo prebuild` does not know how to generate
// extension targets, which is exactly what this plugin is for. Three things
// have to be true, all in generated files this repo does not keep:
//
//   1. the KromaTopShelf extension target exists in the Xcode project and is
//      embedded in the app, compiling targets/top-shelf/ContentProvider.swift;
//   2. both the app and the extension carry the App Group entitlement, because
//      the group's UserDefaults is how the app hands its lists to the
//      extension (see the tv-launcher module's TvLauncherModule.swift);
//   3. the extension's Info.plist declares the com.apple.tv-top-shelf
//      extension point and the same version pair as the app - App Store
//      validation rejects an extension whose version disagrees.
//
// The extension's bundle id is the app's plus ".TopShelf" (an extension must
// extend its host's id), so it follows any future bundle-id rename by itself.
// CI's automatic signing (`-allowProvisioningUpdates` + the ASC API key)
// registers that App ID and mints its profile on first archive; the one
// portal-side effect to know about is that adding the App Group capability
// invalidates previously minted profiles for tv.kroma.mobile - harmless while
// both release lanes re-mint automatically, but a manually imported profile
// would go stale.
//
// APP_GROUP must match the two Swift halves (TvLauncherModule.swift and
// ContentProvider.swift), which duplicate it because the extension compiles
// outside the module's pod.

const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const APP_GROUP = 'group.tv.kroma';
const TARGET = 'KromaTopShelf';
// Falls back to the podspecs' floor if the generated app does not state one.
const FALLBACK_DEPLOYMENT_TARGET = '16.4';

const plistHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">`;

// The extension's Info.plist. The version pair is baked in as literals at
// prebuild time, from the same resolved config the app's own plist gets. The
// ATS exception mirrors the app's own NSAllowsArbitraryLoads: the shelf art
// is served by the user's local, plain-http media server, and the app's
// exception does not extend to a separate bundle.
const infoPlist = (version, build) => `${plistHeader}
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>KROMA</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>XPC!</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${build}</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key><true/>
    <key>NSAllowsLocalNetworking</key><true/>
  </dict>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key><string>com.apple.tv-top-shelf</string>
    <key>NSExtensionPrincipalClass</key><string>$(PRODUCT_MODULE_NAME).ContentProvider</string>
  </dict>
  <!-- Required, and required SEPARATELY from the app's own copy: an extension is
       its own bundle and App Store validation checks each one. Without it the
       .ipa builds, signs, and exports perfectly, and is then rejected at UPLOAD:
       "Invalid Bundle. Your binary, 'tv.kroma.mobile.TopShelf', has a 64-bit
       architecture slice, so you must include the arm64 value for the
       UIRequiredDeviceCapabilities key" (90502). Every Apple TV is arm64, so
       this is a declaration rather than a constraint. -->
  <key>UIRequiredDeviceCapabilities</key>
  <array><string>arm64</string></array>
</dict>
</plist>
`;

const extensionEntitlements = `${plistHeader}
<dict>
  <key>com.apple.security.application-groups</key>
  <array><string>${APP_GROUP}</string></array>
</dict>
</plist>
`;

// The app's half of the mailbox: entitle it to the group.
function withAppGroup(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults['com.apple.security.application-groups'] ?? [];
    cfg.modResults['com.apple.security.application-groups'] = [...new Set([...groups, APP_GROUP])];
    return cfg;
  });
}

// Materialize the extension's files inside the generated ios/ folder: the
// provider source (copied from targets/top-shelf/, the file this repo keeps),
// plus the Info.plist and entitlements written from scratch.
function withExtensionFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const src = path.join(
        cfg.modRequest.projectRoot,
        'targets',
        'top-shelf',
        'ContentProvider.swift',
      );
      if (!fs.existsSync(src)) {
        throw new Error(
          `with-top-shelf: ${src} is missing. The extension source moved - ` +
            're-point this plugin, or the Apple TV home screen silently falls ' +
            'back to the static Top Shelf artwork.',
        );
      }
      const dest = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(src, path.join(dest, 'ContentProvider.swift'));
      fs.writeFileSync(
        path.join(dest, `${TARGET}-Info.plist`),
        infoPlist(cfg.version ?? '1.0.0', cfg.ios?.buildNumber ?? '1'),
      );
      fs.writeFileSync(path.join(dest, `${TARGET}.entitlements`), extensionEntitlements);
      return cfg;
    },
  ]);
}

// The extension target itself. `addTarget` does the heavy lifting: product,
// build configurations, the app-target dependency, and the copy phase that
// embeds the .appex - the leftovers are its source file and the tvOS build
// settings the generic defaults do not know.
function withExtensionTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const targets = proj.hash.project.objects.PBXNativeTarget ?? {};

    // Prebuild without --clean re-runs every mod on the existing project; a
    // second addTarget would mint a duplicate, so presence is the guard.
    const exists = Object.values(targets).some((t) => t?.name?.replaceAll('"', '') === TARGET);
    if (exists) return cfg;

    const appBundleId = cfg.ios?.bundleIdentifier;
    if (!appBundleId) {
      throw new Error('with-top-shelf: no ios.bundleIdentifier in the Expo config.');
    }

    // The app's own deployment target, so the extension never claims to run
    // somewhere its host does not.
    const configurations = proj.pbxXCBuildConfigurationSection();
    const deploymentTarget =
      Object.values(configurations).find((c) => c?.buildSettings?.TVOS_DEPLOYMENT_TARGET)
        ?.buildSettings.TVOS_DEPLOYMENT_TARGET ?? FALLBACK_DEPLOYMENT_TARGET;

    const target = proj.addTarget(TARGET, 'app_extension', TARGET, `${appBundleId}.TopShelf`);
    proj.addBuildPhase(
      [`${TARGET}/ContentProvider.swift`],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    );
    // TVServices itself arrives via Swift auto-linking; the phase just has to exist.
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    // addTarget's generic Debug/Release configurations know nothing about
    // tvOS or Swift; teach them. INFOPLIST_FILE already matches the
    // `<target>/<target>-Info.plist` file the dangerous mod wrote.
    for (const c of Object.values(configurations)) {
      if (c?.buildSettings?.PRODUCT_NAME !== `"${TARGET}"`) continue;
      Object.assign(c.buildSettings, {
        SDKROOT: 'appletvos',
        TARGETED_DEVICE_FAMILY: '3',
        TVOS_DEPLOYMENT_TARGET: deploymentTarget,
        SWIFT_VERSION: '5.0',
        CODE_SIGN_ENTITLEMENTS: `${TARGET}/${TARGET}.entitlements`,
        // An extension may only use extension-safe API; enforcing it here
        // keeps a stray UIApplication reference a build error, not a review
        // rejection.
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        GENERATE_INFOPLIST_FILE: 'NO',
      });
    }
    return cfg;
  });
}

const withTopShelf = (config) => withExtensionTarget(withExtensionFiles(withAppGroup(config)));

module.exports = createRunOncePlugin(withTopShelf, 'kroma-top-shelf', '1.0.0');
