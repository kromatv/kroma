// `expo-notifications` calls `requireNativeModule()` at module scope and
// throws when the native module isn't in the binary, taking the app down at
// launch, hence the guarded require. It must be `require`, not `await
// import(...)`: Metro compiles a dynamic import in a dev build into a
// split-bundle fetch that throws `Expected HMRClient.setup() call at startup`.

type NotificationsModule = typeof import('expo-notifications');

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
