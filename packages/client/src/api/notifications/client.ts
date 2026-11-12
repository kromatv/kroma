import type { RequestContext } from '../../core/client';
import type { NotificationId } from './ids';
import { pushApi } from './push';
import {
  DeliveriesView,
  InboxCounts,
  type NotificationAction,
  NotificationPrefs,
  NotificationsView,
  type PrefsUpdate,
} from './schemas';

/** The notification centre. Every call is scoped to the signed-in account: the
 * server takes the user from the session and ignores any id that says otherwise. */
export default function notificationsApi(ctx: RequestContext) {
  return {
    push: pushApi(ctx),

    /** Newest first, with the counts. `archived` lists the rows put away instead. */
    list: (shelf: { archived?: boolean } = {}) =>
      ctx.get(
        '/notifications',
        NotificationsView,
        shelf.archived ? { query: { archived: true } } : undefined,
      ),

    /** What became of this account's own pushes, newest first. Each record
     * names the device it was sent to and never that device's address. */
    deliveries: () => ctx.get('/notifications/deliveries', DeliveriesView),

    markRead: (ids: NotificationId[]) =>
      ctx.post('/notifications/read', InboxCounts, { body: { ids } }),

    /** Put rows back in the unread pile. There is no "all" here on purpose: the
     * affordance is per-row, and nobody wants a whole inbox back. */
    markUnread: (ids: NotificationId[]) =>
      ctx.post('/notifications/unread', InboxCounts, { body: { ids } }),

    /** Omitting `ids` is what the server reads as "all". */
    markAllRead: () => ctx.post('/notifications/read', InboxCounts, { body: {} }),

    /** The panel was opened: every row in the inbox counts as seen, and the
     * badge clears. */
    markSeen: () => ctx.post('/notifications/seen', InboxCounts, { body: {} }),

    /** Put rows away: they leave the inbox and the badge. Archive replaces delete. */
    archive: (ids: NotificationId[]) =>
      ctx.post('/notifications/archive', InboxCounts, { body: { ids } }),

    /** Put away every row already read, past the page the panel shows as well. */
    archiveRead: () => ctx.post('/notifications/archive/read', InboxCounts, { body: {} }),

    /** Bring archived rows back to the inbox. */
    unarchive: (ids: NotificationId[]) =>
      ctx.post('/notifications/unarchive', InboxCounts, { body: { ids } }),

    /** One of the row's actions was pressed. Only the first press is kept. */
    interacted: (id: NotificationId) =>
      ctx.post('/notifications/:id/interacted', { params: { id } }),

    /** For a server older than archive; a current client archives instead. */
    delete: (id: NotificationId) => ctx.delete('/notifications/:id', { params: { id } }),

    /** The full delivery matrix, every category and every kind under them,
     * defaults filled in. */
    prefs: () => ctx.get('/notifications/prefs', NotificationPrefs),

    /** Writes what changed and answers the matrix it leaves. */
    setPrefs: (update: PrefsUpdate) =>
      ctx.put('/notifications/prefs', NotificationPrefs, { body: update }),

    /** Run a notification's `api` action (approve or deny straight from the row).
     * `href` is already API-absolute, so the `/api` the transport adds back is
     * stripped first. */
    runAction: (action: Pick<NotificationAction, 'href' | 'method'>): Promise<void> => {
      const path = action.href.replace(/^\/api/, '');
      switch (action.method?.toUpperCase()) {
        case 'DELETE':
          return ctx.delete(path);
        case 'PUT':
          return ctx.put(path);
        case 'PATCH':
          return ctx.patch(path);
        default:
          return ctx.post(path);
      }
    },
  };
}

declare module '../../core/client' {
  interface Domains {
    notifications: ReturnType<typeof notificationsApi>;
  }
}
