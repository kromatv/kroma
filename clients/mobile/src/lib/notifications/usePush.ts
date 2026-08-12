// Mounted at the root: how an arriving push behaves and where a tap routes.
// Must survive a build with no native push module (see `./native`): nothing
// here imports `expo-notifications` at module scope.

import type * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { deviceLabel } from '#mobile/lib/device';
import { useT } from '#mobile/lib/i18n';
import { useSession } from '#mobile/lib/session';

import { push as loadPush } from './native';
import { registerAndroidChannels, registerCategories, setPushTranslator } from './push';
import { refreshGrant } from './relay';
import { handleTap } from './taps';

/**
 * Keeps category/channel labels registered with iOS/Android in step with the
 * app language: the OS keeps whatever text they were last registered with, so a
 * language change needs a re-registration to reach the lock screen.
 */
export function usePushLabels(): void {
  const t = useT();
  useEffect(() => {
    setPushTranslator(t);
    void registerCategories();
    void registerAndroidChannels();
  }, [t]);
}

/**
 * Re-mints this device's relay grant before it expires. Only the app can
 * replace one: the server holds a sealed blob with no idea which device is
 * behind it. Only runs when a grant already exists; failures are silent since
 * the existing grant stays valid for weeks yet.
 */
export function usePushGrantRefresh(): void {
  const { status, client } = useSession();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn || !client) return;
    let cancelled = false;

    void (async () => {
      try {
        const refreshed = await refreshGrant();
        if (!refreshed || cancelled) return;
        await client.subscribePush({
          transport: 'relay',
          endpoint: refreshed.grant,
          device: deviceLabel(),
        });
        await refreshed.commit();
        // Subscriptions key on the endpoint, so the new grant is a new row. The
        // old one won't expire for weeks, so it must be retired here or every
        // notification arrives twice.
        try {
          await client.unsubscribePush(refreshed.previous);
        } catch {
          // A duplicate is better than a lost registration.
        }
      } catch {
        // Best effort: the already-registered grant still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, client]);
}

// Module scope on purpose: must outlive the effect (which re-runs on a profile
// switch) and die only with the JS context.
let coldStartConsumed = false;

/** Routes taps on pushes, covering both a live tap and the tap that
 * cold-started the app. */
export function usePushTaps(): void {
  const { status, client } = useSession();
  const router = useRouter();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn || !client) return;
    let cancelled = false;
    let subscription: { remove(): void } | undefined;

    void (async () => {
      const push = loadPush();
      // No native push in this build: the in-app centre still works.
      if (!push || cancelled) return;

      // Banner only, no sound: the app is already in hand.
      push.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
        }),
      });

      const go = async (response: Notifications.NotificationResponse) => {
        const route = await handleTap(response, client);
        // Guards a sign-out landing between the await and the push.
        if (route && !cancelled) router.push(route as never);
      };

      // `getLastNotificationResponse` is STICKY for the life of the JS context,
      // and this effect re-runs on a profile switch; without this guard the
      // launch tap would replay under the new account.
      if (!coldStartConsumed) {
        coldStartConsumed = true;
        const initial = push.getLastNotificationResponse();
        if (initial && !cancelled) await go(initial);
      }
      if (cancelled) return;

      subscription = push.addNotificationResponseReceivedListener((response) => {
        void go(response);
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [signedIn, client, router]);
}
