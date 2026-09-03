import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import type { NotificationId } from './ids';
import { pushApi } from './push';
import { type NotificationAction, NotificationPrefs, NotificationsView } from './schemas';

const Unread = z.object({ unread: z.number() });

/** The notification centre. Every call is scoped to the signed-in account: the
 * server takes the user from the session and ignores any id that says otherwise. */
export default function notificationsApi(ctx: RequestContext) {
  return {
    push: pushApi(ctx),

    /** Newest first, with the unread tally. */
    list: () => ctx.get('/notifications', NotificationsView),

    markRead: (ids: NotificationId[]) => ctx.post('/notifications/read', Unread, { body: { ids } }),

    /** Put rows back in the unread pile. There is no "all" here on purpose: the
     * affordance is per-row, and nobody wants a whole inbox back. */
    markUnread: (ids: NotificationId[]) =>
      ctx.post('/notifications/unread', Unread, { body: { ids } }),

    /** Omitting `ids` is what the server reads as "all". */
    markAllRead: () => ctx.post('/notifications/read', Unread, { body: {} }),

    delete: (id: NotificationId) => ctx.delete('/notifications/:id', { params: { id } }),

    /** The full per-category delivery matrix, defaults filled in. */
    prefs: () => ctx.get('/notifications/prefs', NotificationPrefs),

    setPrefs: (prefs: NotificationPrefs) =>
      ctx.put('/notifications/prefs', NotificationPrefs, { body: prefs }),

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
