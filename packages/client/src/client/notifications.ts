// The notification centre. Every call is scoped to the signed-in account: the
// server takes the user from the session and ignores any id that says otherwise.

import type { Notification, NotificationPrefs, NotificationsView, SubscribeBody } from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

/** Newest-first, with the unread tally. */
export function listNotifications(ctx: RequestContext): Promise<NotificationsView> {
  return ctx.json<NotificationsView>('/notifications');
}

export function markRead(ctx: RequestContext, ids: string[]): Promise<{ unread: number }> {
  return ctx.json<{ unread: number }>('/notifications/read', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ ids }),
  });
}

/** Put rows back in the unread pile. There is no "all" here on purpose: the
 * affordance is per-row, and nobody wants a whole inbox back. */
export function markUnread(ctx: RequestContext, ids: string[]): Promise<{ unread: number }> {
  return ctx.json<{ unread: number }>('/notifications/unread', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ ids }),
  });
}

/** Omitting `ids` is what the server reads as "all". */
export function markAllRead(ctx: RequestContext): Promise<{ unread: number }> {
  return ctx.json<{ unread: number }>('/notifications/read', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({}),
  });
}

export function deleteNotification(ctx: RequestContext, id: string): Promise<void> {
  return ctx.json<void>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** The full per-category delivery matrix, defaults filled in. */
export function getNotificationPrefs(ctx: RequestContext): Promise<NotificationPrefs> {
  return ctx.json<NotificationPrefs>('/notifications/prefs');
}

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

/** The server's VAPID public key (`applicationServerKey`); the keypair is minted
 * on the first call. */
export function pushKey(ctx: RequestContext): Promise<{ publicKey: string; subscribed: boolean }> {
  return ctx.json<{ publicKey: string; subscribed: boolean }>('/push/key');
}

/** Re-registering the same endpoint updates it rather than duplicating, and
 * moves it to the calling account. */
export function subscribePush(ctx: RequestContext, body: SubscribeBody): Promise<void> {
  return ctx.json<void>('/push/subscribe', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function unsubscribePush(ctx: RequestContext, endpoint: string): Promise<void> {
  return ctx.json<void>('/push/subscribe', {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ endpoint }),
  });
}

export function testPush(ctx: RequestContext): Promise<{ delivered: number }> {
  return ctx.json<{ delivered: number }>('/push/test', { method: 'POST' });
}

export function runNotificationAction(
  ctx: RequestContext,
  action: Pick<Notification['actions'][number], 'href' | 'method'>,
): Promise<void> {
  // `href` is already API-absolute (`/api/requests/x/approve`); strip the `/api`
  // prefix the RequestContext adds back.
  const path = action.href.replace(/^\/api/, '');
  return ctx.json<void>(path, { method: action.method ?? 'POST' });
}
