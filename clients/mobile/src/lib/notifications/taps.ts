// What happens when someone taps a push.
//
// A body tap opens the app at the linked screen; an action-button tap may not
// (`opensAppToForeground: false`) — approving a request from the lock screen
// must not launch the app. APNs only shows pre-registered button labels, so
// what each button does rides in the payload instead.

import type { KromaClient } from '@kroma/core';
import type * as Notifications from 'expo-notifications';
import { z } from 'zod';

import { mobileRoute } from './route';

export const PushAction = z.object({
  id: z.string().min(1),
  method: z.string().min(1).catch('POST'),
  href: z.string().min(1),
});
export type PushAction = z.infer<typeof PushAction>;

// Every FCM `data` value must be a string, so Android sends actions as an
// encoded string while iOS sends an array; a malformed button is dropped
// rather than failing the whole payload.
const PushActions = z
  .union([z.string().transform(jsonOrNull), z.unknown()])
  .pipe(z.array(z.unknown()).catch([]))
  .transform((list) => list.flatMap((e) => PushAction.safeParse(e).data ?? []));

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
      return null;
    } catch {
      // Offline, or already reviewed by someone else: open the app so it can
      // be finished by hand rather than silently swallowing the tap.
    }
  }

  return mobileRoute(data.link);
}
