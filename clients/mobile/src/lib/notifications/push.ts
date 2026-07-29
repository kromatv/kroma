// This phone's push capability.
//
// Only what is genuinely native: whether the binary can do push at all, the
// permission prompt, the device token, and the action sets / channels the system
// needs registered up front. The flow around it — check, then prompt, then
// register with the server — is shared with the web client in `@kroma/core`'s
// `enablePush` / `disablePush`.
//
// The token is the RAW APNs/FCM one (`getDevicePushTokenAsync`), not an Expo
// push token: nothing goes through expo.dev and no Expo project exists.
//
// That raw token is never handed to a server. It is traded at push.kroma.tv for
// a grant (see `./relay`), and the grant is what gets registered — because a
// self-hosted server holds no credential Apple or Google would accept, so a
// token would be useless to it, and because a grant is scoped to this one device
// and unreadable even to the server storing it.
//
// Note what is NOT here: rendering. When a push arrives the system draws it, and
// the in-app centre (`./index`) is the source of truth for the list — a push is
// a nudge toward a row that already exists on the server.

import type {
  MessageKey,
  PushBlocker,
  PushCapability,
  SubscribeBody,
  Translate,
} from '@kroma/core';
import { createTranslator, DEFAULT_LOCALE } from '@kroma/core';
import * as Device from 'expo-device';
// Type-only: erased at build time, so it never pulls the native module in.
import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { deviceLabel } from '#mobile/lib/device';

import { push as loadPush } from './native';
import { forgetGrant, grantFor, storedGrant } from './relay';

/**
 * The translator the OS-facing labels use.
 *
 * Every other string in the app is rendered by React inside the i18n provider.
 * These are not: a category's buttons and a channel's name are handed to iOS and
 * Android imperatively, once, and the system keeps whatever text it was given.
 * So the app pushes the live translator in here instead (see `usePushLabels`),
 * and the default locale stands in until it does — a wrong language is better
 * than English hardcoded for everyone.
 */
let translate: Translate = createTranslator(DEFAULT_LOCALE);

/** Point the OS labels at the reader's language. Re-registering is the caller's
 * job: text already handed to the system does not change on its own. */
export function setPushTranslator(next: Translate): void {
  translate = next;
}

/**
 * The action sets the server may name in `push_category`.
 *
 * APNs and Android cannot carry arbitrary buttons: they can only display
 * actions belonging to a category the app registered up front. So this list is
 * the contract — the server picks a name from it, and the buttons come from
 * here. Adding one means adding it on both sides (`kroma-domain`'s
 * `PushCategory`).
 *
 * The labels are the SAME catalogue keys the server renders in-app actions
 * from, so "Approve" on the lock screen and "Approve" in the list are one
 * string in two places rather than two strings that can drift.
 */
const CATEGORIES: Record<
  string,
  { identifier: string; titleKey: MessageKey; opensApp: boolean }[]
> = {
  /** A moderator can approve or deny without opening the app. */
  request_review: [
    { identifier: 'approve', titleKey: 'notifications.action.approve', opensApp: false },
    { identifier: 'deny', titleKey: 'notifications.action.deny', opensApp: false },
  ],
  /** Something the user asked for is ready. */
  media_available: [
    { identifier: 'watch', titleKey: 'notifications.action.watch', opensApp: true },
  ],
};

/** Which service issued this device's token. Not what gets registered — that is
 * always `relay` — but the relay has to be told which one it is sealing. */
function transportFor(type: string): 'apns' | 'fcm' | null {
  if (type === 'ios') return 'apns';
  if (type === 'android') return 'fcm';
  return null;
}

/** Register the categories whose buttons the server may ask for, labelled in the
 * language {@link setPushTranslator} was last given. */
export async function registerCategories(): Promise<void> {
  const Notifications = loadPush();
  if (!Notifications) return;
  await Promise.all(
    Object.entries(CATEGORIES).map(([name, actions]) =>
      Notifications.setNotificationCategoryAsync(
        name,
        actions.map((a) => ({
          identifier: a.identifier,
          buttonTitle: translate(a.titleKey),
          options: { opensAppToForeground: a.opensApp },
        })),
      ),
    ),
  );
}

/**
 * Android requires every notification to name a channel, and the channel — not
 * the payload — owns the importance and the sound. One per category the server
 * sends, so a user can silence "new titles" in the system settings while
 * keeping "your request is ready" loud.
 */
export async function registerAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = loadPush();
  if (!Notifications) return;
  // The name is what a user reads in Android's own notification settings, so it
  // is translated too. `default` keeps the brand, which is not a word to
  // translate.
  const channels: [string, string, ExpoNotifications.AndroidImportance][] = [
    ['default', 'KROMA', Notifications.AndroidImportance.DEFAULT],
    [
      'request_review',
      translate('push.channel.requestReview'),
      Notifications.AndroidImportance.HIGH,
    ],
    [
      'media_available',
      translate('push.channel.mediaAvailable'),
      Notifications.AndroidImportance.HIGH,
    ],
  ];
  await Promise.all(
    channels.map(([id, name, importance]) =>
      Notifications.setNotificationChannelAsync(id, {
        name,
        importance,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      }),
    ),
  );
}

/** The native half of the shared push flow. */
export const nativePush: PushCapability = {
  /**
   * Deliberately does NOT reject a simulator. A simulator shows the permission
   * dialog perfectly well, and on iOS 16+ it can register for real pushes; only
   * minting a token may fail, which `subscribe` reports precisely once it has
   * actually tried. Refusing up front would hide the prompt from exactly the
   * devices most testing happens on.
   */
  async blocker(): Promise<PushBlocker | null> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';
    const Notifications = loadPush();
    // The JS is here but the native module is not: this build predates the
    // dependency and needs `expo prebuild` + a native rebuild.
    if (!Notifications) return 'needs-rebuild';
    const { status } = await Notifications.getPermissionsAsync();
    // `denied` is terminal from inside the app: iOS only ever prompts once, so
    // the user has to change it in Settings.
    return status === 'denied' ? 'denied' : null;
  },

  async subscribe(): Promise<SubscribeBody> {
    const Notifications = loadPush();
    if (!Notifications) throw new Error('needs-rebuild');

    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    if (status !== 'granted') throw new Error('denied');

    await registerCategories();
    await registerAndroidChannels();

    // Only now can a simulator fail: it has shown the dialog, but may have no
    // APNs/FCM registration behind it.
    let token: Awaited<ReturnType<typeof Notifications.getDevicePushTokenAsync>>;
    try {
      token = await Notifications.getDevicePushTokenAsync();
    } catch (e) {
      throw new Error(Device.isDevice ? 'unsupported' : 'simulator', { cause: e });
    }
    const transport = transportFor(token.type);
    if (!transport) throw new Error('unsupported');

    // The raw token stops here. What the server gets is a grant — see
    // `./relay`. Registering the token itself would be pointless as well as
    // careless: a self-hosted server holds no credential Apple or Google would
    // accept, so it could never spend one.
    return {
      transport: 'relay',
      endpoint: await grantFor(transport, String(token.data)),
      device: deviceLabel(),
    };
  },

  /**
   * The endpoint a server has on file for this device — the GRANT, not the
   * device token.
   *
   * This is what `disablePush` names when asking the server to forget the
   * device, so it has to be the exact string `subscribe` registered. Minting a
   * fresh grant here would return a different blob and the server would delete
   * nothing, leaving a phone the reader believes is silent still buzzing.
   */
  async endpoint() {
    return storedGrant();
  },

  async unsubscribe() {
    // An APNs/FCM token is not "unsubscribed" — it simply stops being sent to
    // once the server drops the row. The grant is dropped here so the next
    // enable mints a fresh one rather than re-registering a blob whose server
    // row is gone.
    //
    // Order matters and belongs to the shared flow: `disablePush` reads
    // `endpoint()` BEFORE calling this, so the server is told what to remove
    // while the grant is still on file.
    await forgetGrant();
  },
};
