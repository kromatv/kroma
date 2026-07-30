// This phone's native push capability: permission, device token, and the
// action sets/channels registered up front. The token is raw APNs/FCM (not
// an Expo push token) and is traded at push.kroma.tv for a grant before it's
// ever registered with the server.

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

// OS-facing labels (category buttons, channel names) are handed to iOS/Android
// imperatively, once, so the live translator is pushed in here rather than
// read from context.
let translate: Translate = createTranslator(DEFAULT_LOCALE);

/** Point the OS labels at the reader's language. Re-registering is the caller's
 * job: text already handed to the system does not change on its own. */
export function setPushTranslator(next: Translate): void {
  translate = next;
}

// APNs/Android only show actions from a category registered up front; add a
// variant on both sides (kroma-domain's `PushCategory`) when adding one.
const CATEGORIES: Record<
  string,
  { identifier: string; titleKey: MessageKey; opensApp: boolean }[]
> = {
  request_review: [
    { identifier: 'approve', titleKey: 'notifications.action.approve', opensApp: false },
    { identifier: 'deny', titleKey: 'notifications.action.deny', opensApp: false },
  ],
  media_available: [
    { identifier: 'watch', titleKey: 'notifications.action.watch', opensApp: true },
  ],
};

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

/** Android requires every notification to name a channel, which — not the
 * payload — owns importance and sound; one per category so a user can silence
 * one kind of alert while keeping another loud. */
export async function registerAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = loadPush();
  if (!Notifications) return;
  // Translated: the name shows in Android's own settings. `default` keeps the
  // brand untranslated.
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

export const nativePush: PushCapability = {
  // Does not reject a simulator: it shows the permission dialog fine and can
  // often register for real; only minting a token may fail, which `subscribe`
  // reports once it actually tries.
  async blocker(): Promise<PushBlocker | null> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';
    const Notifications = loadPush();
    // Native module missing: this build predates the dependency, needs `expo prebuild`.
    if (!Notifications) return 'needs-rebuild';
    const { status } = await Notifications.getPermissionsAsync();
    // iOS only prompts once; `denied` can only be undone in Settings.
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

    // The raw token stops here; the server gets a grant instead (see ./relay)
    // — a self-hosted server holds no Apple/Google credential to spend it.
    return {
      transport: 'relay',
      endpoint: await grantFor(transport, String(token.data)),
      device: deviceLabel(),
    };
  },

  // The grant, not the device token: `disablePush` names this exact string
  // when asking the server to forget the device, so minting a fresh grant
  // here instead would leave the server unable to find the row to delete.
  async endpoint() {
    return storedGrant();
  },

  // `disablePush` reads `endpoint()` before calling this, so the grant must
  // still be on file when the server is told what to remove.
  async unsubscribe() {
    await forgetGrant();
  },
};
