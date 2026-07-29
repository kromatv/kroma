// Mounting native push in the app: how an arriving notification behaves, and
// where a tap goes.
//
// This runs at the ROOT, so it must survive a build with no native push module
// (see `./native`). Nothing here imports `expo-notifications` at module scope
// and nothing runs at import time — an older dev client loses push, not the app.
//
// Kept apart from `./push` (which owns permission and registration) because this
// half runs unconditionally while that half only runs on a button press.

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
 * Keep the labels the SYSTEM draws in the reader's language.
 *
 * A category's buttons and a channel's name are registered with iOS/Android, not
 * rendered, so they keep the text they were registered with until they are
 * registered again — change the app language and yesterday's language stays on
 * the lock screen. Re-registering is idempotent and cheap, so this simply runs
 * again whenever the translator changes.
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
 * Keep this device's relay grant from expiring underneath it.
 *
 * A grant is the only thing a server holds, and only the APP can replace one:
 * the server has a sealed blob and no idea which device is behind it, so an
 * expiring grant would just start failing deliveries with nobody able to fix it.
 * The phone still has the device token, so it re-mints here and re-registers.
 *
 * Runs once per launch, and only when there is already a grant on file — this
 * never enables push, it only keeps working push working. Failure is silent by
 * design: the existing grant is valid for weeks yet (see `REFRESH_BEFORE_MS`),
 * so a launch with no connectivity should cost nothing.
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
        // `null` = nothing stored, or not near expiry yet.
        if (!refreshed || cancelled) return;
        await client.subscribePush({
          transport: 'relay',
          endpoint: refreshed.grant,
          device: deviceLabel(),
        });
        // Only now is it this device's grant: until the server had it, the old
        // one was the only thing that could be unregistered.
        await refreshed.commit();
        // The server keys subscriptions on the endpoint, so the new grant landed
        // as a NEW row. The old one has up to a month left and will therefore
        // never fail its way out of the table - so it has to be retired here, or
        // every notification arrives twice.
        try {
          await client.unsubscribePush(refreshed.previous);
        } catch {
          // A duplicate is better than a lost registration; the stored grant is
          // already correct either way.
        }
      } catch {
        // Best effort: the grant that is already registered still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, client]);
}

/** Whether this launch's cold-start tap has been acted on. Module scope on
 * purpose: it must outlive the effect (which re-runs on a profile switch) and
 * die with the JS context, which is exactly what the sticky response does. */
let coldStartConsumed = false;

/**
 * Route taps on pushes. Mounted once, near the root, alongside the in-app
 * notification stream.
 *
 * Covers both entry points: a tap while the app is running, and the tap that
 * launched it from cold (`getLastNotificationResponse`) — miss the second
 * and a notification opened from a killed app lands on the home screen instead
 * of the film it was about.
 */
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

      // A push that arrives while the app is open should still be seen: the
      // bell updates from the socket, but the user may be three screens deep.
      // Banner only — no sound, since the app is already in hand.
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

      // The tap that cold-started the app, if any - and only once per launch.
      //
      // `getLastNotificationResponse` is STICKY: it keeps answering with
      // the same response for the life of the JS context, and this effect
      // re-runs whenever `client` changes identity, which switching profile
      // does. So the launch tap was replayed on every switch - re-POSTing an
      // `api` action (approving a request a second time, now as whichever
      // account was just selected) or yanking the router to an old
      // notification's screen unprompted. `cancelled` cannot help: it is a
      // fresh binding per run.
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
