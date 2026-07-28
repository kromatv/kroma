// The notification centre: read the inbox, mark rows read, drop one, and manage
// the per-category delivery matrix.
//
// Every call is implicitly scoped to the signed-in account there is no "whose
// inbox" parameter, because the server takes the user from the session and
// ignores any id that says otherwise.

import type { Notification, NotificationPrefs, NotificationsView, SubscribeBody } from '../types';
import type { RequestContext } from './base';

const JSON_HEADERS = { 'content-type': 'application/json' };

/** The caller's notifications, newest-first, with the unread tally for the bell. */
export function listNotifications(ctx: RequestContext): Promise<NotificationsView> {
  return ctx.json<NotificationsView>('/notifications');
}

/** Mark specific notifications read. Returns the new unread count. */
export function markRead(ctx: RequestContext, ids: string[]): Promise<{ unread: number }> {
  return ctx.json<{ unread: number }>('/notifications/read', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ ids }),
  });
}

/** Mark everything read (omitting `ids` is what the server reads as "all"). */
export function markAllRead(ctx: RequestContext): Promise<{ unread: number }> {
  return ctx.json<{ unread: number }>('/notifications/read', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({}),
  });
}

/** Delete one of the caller's own notifications. */
export function deleteNotification(ctx: RequestContext, id: string): Promise<void> {
  return ctx.json<void>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** The full per-category delivery matrix, defaults filled in, so the settings
 * screen can render every switch without knowing which were explicitly set. */
export function getNotificationPrefs(ctx: RequestContext): Promise<NotificationPrefs> {
  return ctx.json<NotificationPrefs>('/notifications/prefs');
}

/** Replace the caller's delivery matrix. */
export function setNotificationPrefs(
  ctx: RequestContext,
  prefs: NotificationPrefs,
): Promise<NotificationPrefs> {
  return ctx.json<NotificationPrefs>('/notifications/prefs', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(prefs),
  });
}

/** The server's VAPID public key (`applicationServerKey`), plus whether this
 * account already has a push endpoint registered. The keypair is minted on the
 * first call, so a server nobody enabled push on never grows one. */
export function pushKey(ctx: RequestContext): Promise<{ publicKey: string; subscribed: boolean }> {
  return ctx.json<{ publicKey: string; subscribed: boolean }>('/push/key');
}

/** Register this device's push endpoint. Re-registering the same endpoint
 * updates it rather than duplicating, and moves it to the calling account. */
export function subscribePush(ctx: RequestContext, body: SubscribeBody): Promise<void> {
  return ctx.json<void>('/push/subscribe', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Drop this device's endpoint (scoped to the caller server-side). */
export function unsubscribePush(ctx: RequestContext, endpoint: string): Promise<void> {
  return ctx.json<void>('/push/subscribe', {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ endpoint }),
  });
}

/** Send the caller one push, so "is this actually working?" is answerable from
 * the settings screen. Returns how many of their devices accepted it. */
export function testPush(ctx: RequestContext): Promise<{ delivered: number }> {
  return ctx.json<{ delivered: number }>('/push/test', { method: 'POST' });
}

/** Run a notification's `api` action (approve / deny from the row itself). The
 * action carries its own absolute `/api/...` href and method, so this is a plain
 * pass-through rather than a per-action client method. */
export function runNotificationAction(
  ctx: RequestContext,
  action: Pick<Notification['actions'][number], 'href' | 'method'>,
): Promise<void> {
  // `href` is already API-absolute (`/api/requests/x/approve`); strip the `/api`
  // prefix the RequestContext adds back.
  const path = action.href.replace(/^\/api/, '');
  return ctx.json<void>(path, { method: action.method ?? 'POST' });
}
