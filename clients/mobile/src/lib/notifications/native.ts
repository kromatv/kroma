// Reaching expo-notifications without betting the app on it.
//
// `expo-notifications` is a NATIVE module, and its entry point calls
// `requireNativeModule()` at module scope — which throws when the module is not
// in the running binary. That happens more often than it sounds: any build made
// before the dependency was added (an installed dev client, a colleague's
// simulator, a TestFlight build from last week) has the new JS but not the new
// native code.
//
// Imported eagerly from the root layout, that throw takes the WHOLE APP down on
// launch. So it is loaded through a guarded `require` instead: `push()` returns
// null when the module isn't there, every caller treats null as "push is
// unavailable here", and the rest of the app is untouched. Same shape as
// `loadCamera` in the connect-device route and `localIpProvider`.
//
// It must be `require` and NOT `await import(...)`. Metro compiles a dynamic
// import in a dev build into a SPLIT BUNDLE fetch, which goes through
// `HMRClient.registerBundle()` and throws `Expected HMRClient.setup() call at
// startup` — so a dynamic import fails on every dev build regardless of what is
// in the binary, and push would look permanently missing while developing.
//
// The fix for the underlying condition is a native rebuild (`expo prebuild` +
// `expo run:ios` / `run:android`). This just makes the failure a disabled
// toggle rather than a dead app.

type NotificationsModule = typeof import('expo-notifications');

/**
 * The notifications module, or `null` when this build has no native support.
 *
 * Resolved once at import time: the require either works for the process's
 * lifetime or never will, and it is cheap when the module is absent.
 */
function load(): NotificationsModule | null {
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

const notifications = load();

/** The notifications module, or `null` when this build has no native support. */
export function push(): NotificationsModule | null {
  return notifications;
}
