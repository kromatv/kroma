// What happens when someone taps a push.
//
// Two paths, and the difference matters: tapping the notification BODY opens the
// app at the linked screen, while tapping an action BUTTON may not open the app
// at all (`opensAppToForeground: false`) — a moderator approving a request from
// the lock screen expects the request approved, not the app launched.
//
// The buttons themselves come from the category the app registered (APNs can
// only show pre-registered actions), but what each one DOES rides in the
// payload. So the phone runs exactly the call the web row's button would,
// instead of reconstructing an id out of the link.

import type { KromaClient } from '@kroma/core';
import type * as Notifications from 'expo-notifications';
import { z } from 'zod';

import { mobileRoute } from './route';

/** One action button's effect, as the server sent it. */
export const PushAction = z.object({
  id: z.string().min(1),
  method: z.string().min(1).catch('POST'),
  href: z.string().min(1),
});
export type PushAction = z.infer<typeof PushAction>;

/**
 * Actions arrive as an array on iOS and as an encoded string on Android (every
 * FCM `data` value must be a string), so both shapes are accepted. A malformed
 * button is dropped rather than failing the whole payload: the tap should still
 * open the app at its link.
 */
const PushActions = z
  .union([z.string().transform(jsonOrNull), z.unknown()])
  .pipe(z.array(z.unknown()).catch([]))
  .transform((list) => list.flatMap((e) => PushAction.safeParse(e).data ?? []));

/** The fields KROMA puts on a push, whichever service delivered it. */
export const PushData = z.object({
  id: z.string().min(1).optional().catch(undefined),
  link: z.string().min(1).optional().catch(undefined),
  category: z.string().min(1).optional().catch(undefined),
  actions: PushActions.catch([]),
});
export type PushData = z.infer<typeof PushData>;

/** Read our payload off a notification, whatever shape the platform wrapped it in. */
export function pushData(notification: Notifications.Notification): PushData {
  const parsed = PushData.safeParse(notification.request.content.data ?? {});
  // A push that does not parse is still a tap the reader made: fall back to an
  // empty payload, which opens the app, rather than dropping the tap entirely.
  return parsed.success ? parsed.data : { actions: [] };
}

function jsonOrNull(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Act on a tap. Returns the route to navigate to, or `null` when the tap needs
 * no navigation — an action that ran in the background, or a link with no phone
 * screen.
 */
export async function handleTap(
  response: Notifications.NotificationResponse,
  client: KromaClient,
): Promise<string | null> {
  const data = pushData(response.notification);
  const action = data.actions.find((a) => a.id === response.actionIdentifier);

  if (action) {
    try {
      await client.runNotificationAction(action);
      return null; // decided in the background; nothing to open
    } catch {
      // It did not land (offline, or already reviewed by someone else). Fall
      // through and open the app so it can be done by hand, rather than
      // silently swallowing the tap.
    }
  }

  return mobileRoute(data.link);
}
