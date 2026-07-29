/** The two payloads a validated notification becomes.
 *
 * Shape and validation live in `schemas.ts`; this file only translates. The two
 * builders mirror `kroma-push`'s `apns.rs` and `fcm.rs` field for field, and are
 * duplicated rather than shared because the alternative — servers posting
 * pre-built payloads — would let a caller choose the topic and the priority.
 */

import type { Notification } from './schemas';

export type { Action, Notification, Urgency } from './schemas';

/** The Apple payload. `mutable-content` lets a Notification Service Extension
 * attach `imageUrl`; harmless when the app ships no extension. */
export function apnsPayload(n: Notification): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: n.title, body: n.body },
    sound: 'default',
    'mutable-content': 1,
  };
  if (n.category) aps.category = n.category;
  if (n.threadId) aps['thread-id'] = n.threadId;

  const payload: Record<string, unknown> = { aps, id: n.id };
  if (n.link) payload.link = n.link;
  if (n.imageUrl) payload.imageUrl = n.imageUrl;
  if (n.actions.length) payload.actions = n.actions;
  return payload;
}

/** The Google message body, around the token the caller does not get to choose. */
export function fcmMessage(n: Notification, deviceToken: string): Record<string, unknown> {
  const notification: Record<string, unknown> = { title: n.title, body: n.body };
  if (n.imageUrl) notification.image = n.imageUrl;

  // Everything the app needs on tap rides in `data`, which survives both the
  // foreground and background paths.
  const data: Record<string, unknown> = { id: n.id };
  if (n.link) data.link = n.link;
  if (n.category) data.category = n.category;
  if (n.actions.length) {
    // Every `data` value must be a string on FCM, so the list travels encoded.
    data.actions = JSON.stringify(n.actions);
  }

  const android: Record<string, unknown> = {
    priority: n.urgency === 'low' ? 'normal' : 'high',
    notification: {
      // Android 8+ requires a channel; the app creates one per category.
      channel_id: n.category ?? 'default',
      // No `click_action`: it names an intent action an activity must declare an
      // <intent-filter> for, and the app declares none - so a tap resolved to
      // nothing at all. Absent, Firebase builds the content intent from the
      // launcher activity, which is what opens the app and lets
      // `expo-notifications` hand the tap to the router.
      // `threadId` is deliberately NOT mapped onto `tag` or `collapse_key`,
      // though the names invite it. It means "group these together", which is
      // what it does on Apple; on Android `tag` REPLACES the shade entry and
      // `collapse_key` tells FCM to store-and-forward only the most recent - so
      // a season drop of four episodes showed one row, and a phone that was
      // offline received one notification instead of four. Grouping on Android
      // is the client's job (a group key on the channel).
    },
  };

  return { message: { token: deviceToken, notification, data, android } };
}
