// Makes the Android TV remote reach JavaScript at all.
//
// The bug this exists for: on Android TV with the New Architecture, NOTHING the
// remote does arrives in JS. The app renders, the window is focused, the input
// dispatcher delivers - and every arrow, OK and Menu vanishes.
//
// Why. `useTVEventHandler` (Libraries/Components/TV/TVEventHandler.js) listens
// for `onHWKeyEvent` on NativeTVNavigationEventEmitter. On Android that event is
// emitted by ReactAndroidHWInputDeviceHelper, which is constructed in exactly one
// place: ReactRootView, the LEGACY root. With `newArchEnabled=true` the root is
// ReactSurfaceView instead, which never touches that helper - it routes keys
// through JSKeyDispatcher to per-view `onKeyDown`/`onKeyUp` props, and only when
// the `enableKeyEvents` feature flag is on. The flag defaults to FALSE, so the
// new path is dark and the old path is unreachable: the remote is simply dead.
// (tvOS is unaffected - it still has RCTTVNavigationEventEmitter.mm.)
//
// This plugin turns that flag on. `enableKeyEvents` is a NATIVE flag, and
// ReactNativeFeatureFlags.override() in JS refuses anything but JS-only flags
// ("Only JS-only flags can be overridden from JavaScript"), so the override has
// to happen in Kotlin, before the React host reads a flag - hence MainApplication
// and hence a config plugin: clients/tv-native/android is gitignored, generated
// by `expo prebuild`, and a hand-edit there is lost on the next run.
//
// The other half is packages/ui/src/lib/focus-remote.ts, which grows an Android
// branch to read those per-view events. Neither half is any use alone.

const { withMainApplication, createRunOncePlugin } = require('expo/config-plugins');

const FLAGS_IMPORT = 'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags';
const DEFAULTS_IMPORT =
  'import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults';
const LOG_IMPORT = 'import android.util.Log';

/** Anchored on the existing new-architecture import, which is the block this
 * belongs next to and is only present because the app is on Fabric at all. */
const IMPORT_ANCHOR = 'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint';

/**
 * The override goes immediately AFTER this line, and every part of that is a
 * crash avoided. Both were hit on the way here, on a real Android TV:
 *
 *  - BEFORE it: `IllegalStateException: SoLoader.init() not yet called`. The
 *    override reaches the C++ accessor (ReactNativeFeatureFlagsCxxInterop),
 *    which loads a native library, and `loadReactNative` is what initialises
 *    SoLoader.
 *  - Plain `override()` on either side: `Feature flags cannot be overridden
 *    more than once`. `loadReactNative` sets the new-architecture defaults
 *    itself, so ours is always the second call - hence
 *    `dangerouslyForceOverride`, which is reset-then-override in one step and
 *    exists for exactly this.
 *
 * After `loadReactNative` is still early enough to matter: `reactHost` is a
 * `by lazy`, so nothing reads a flag until the first Activity asks for the
 * host, which cannot happen from inside Application.onCreate.
 */
const LOAD_ANCHOR = 'loadReactNative(this)';

// Subclassing the NEW ARCHITECTURE defaults, not the plain ones: a force
// override replaces the provider wholesale, and `loadReactNative` had just
// installed these (Fabric, bridgeless, TurboModules). Extending the plain
// defaults would switch the app back to the old architecture as a side effect.
const OVERRIDE = `
    // Android TV: without this the remote never reaches JS. Fabric routes key
    // presses through JSKeyDispatcher to per-view onKeyDown, and only when this
    // flag is on; the legacy onHWKeyEvent path useTVEventHandler listens to is
    // not emitted by the Fabric root at all. See plugins/with-tv-key-events.js.
    val flagsReadBeforeOverride =
      ReactNativeFeatureFlags.dangerouslyForceOverride(
        object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
          override fun enableKeyEvents(): Boolean = true
        }
      )
    // Anything named here was read with the OLD value and kept it. Empty in
    // practice, and worth knowing about loudly if that ever stops being true.
    if (flagsReadBeforeOverride != null) {
      Log.w("KROMA", "TV key events: flags read before override: " + flagsReadBeforeOverride)
    }`;

function withTvKeyEvents(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    // Idempotent: prebuild without --clean re-runs plugins over a file that may
    // already carry the patch.
    if (contents.includes('enableKeyEvents')) return cfg;
    // `Log` is not in the generated template's imports; the flags ones are not
    // either. All three go in together, next to the anchor below.

    if (!contents.includes(IMPORT_ANCHOR)) {
      throw new Error(
        'with-tv-key-events: could not find the new-architecture import in ' +
          'MainApplication.kt. The Expo template changed - re-point this plugin, or ' +
          'the Android TV remote will silently stop working.',
      );
    }
    contents = contents.replace(
      IMPORT_ANCHOR,
      `${IMPORT_ANCHOR}\n${FLAGS_IMPORT}\n${DEFAULTS_IMPORT}\n${LOG_IMPORT}`,
    );

    if (!contents.includes(LOAD_ANCHOR)) {
      throw new Error(
        'with-tv-key-events: could not find loadReactNative(this) in ' +
          'MainApplication.kt. The Expo template changed - re-point this plugin, or ' +
          'the Android TV remote will silently stop working.',
      );
    }
    // After SoLoader is up, before any flag is read. See LOAD_ANCHOR.
    cfg.modResults.contents = contents.replace(LOAD_ANCHOR, `${LOAD_ANCHOR}${OVERRIDE}`);
    return cfg;
  });
}

module.exports = createRunOncePlugin(withTvKeyEvents, 'kroma-tv-key-events', '1.0.0');
