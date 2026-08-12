// The server addresses `notification.created` / `notification.read` to the
// recipient: a socket only ever receives its own account's, so nothing that
// arrives here needs filtering.

import { KromaEvents, type NotificationsView } from '@kroma/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiBase, kromaClient } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';

/** Subscribe to notification pushes and keep the cached inbox + badge in sync. */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (e.type !== 'notification.created' && e.type !== 'notification.read') return;
        // Patch the badge from the event's own count, so it is right even when
        // the panel is closed and the list is never refetched.
        queryClient.setQueryData(
          userQueries.notifications().queryKey,
          (prev: NotificationsView | undefined) => (prev ? { ...prev, unread: e.unread } : prev),
        );
        void queryClient.invalidateQueries({
          queryKey: userQueries.notifications().queryKey,
          refetchType: 'active',
        });
      },
    });
    ev.connect();
    return () => ev.close();
  }, [queryClient]);
}

/** Kept live by {@link useNotificationStream}. */
export function useUnreadCount(): number {
  const { data } = useQuery({ ...userQueries.notifications(), select: (v) => v.unread });
  return data ?? 0;
}

/** Which rows the panel is showing. */
export type NotificationFilter = 'all' | 'unread';

/** The optimistic patch behind {@link useReadState}, without the transport:
 * the rows named by `ids` move to `read`, and the badge follows by however many
 * of them actually changed side. */
export function applyRead(
  view: NotificationsView,
  ids: string[],
  read: boolean,
): NotificationsView {
  const wanted = new Set(ids);
  let delta = 0;
  const notifications = view.notifications.map((n) => {
    if (!wanted.has(n.id) || n.read === read) return n;
    delta += read ? -1 : 1;
    return { ...n, read };
  });
  return delta === 0 ? view : { notifications, unread: Math.max(0, view.unread + delta) };
}

/**
 * Which rows the "Unread" filter shows: everything still unread, plus anything
 * the reader marked read while the filter was on.
 *
 * Without the second half, pressing the read toggle would delete the row from
 * under the control that would put it back, so the one affordance the panel
 * exists to offer would be the one that cannot be undone. The returned `sticky`
 * set replaces the one passed in, so ids the server has since dropped fall out
 * rather than accumulating for the life of the tab.
 */
export function unreadView(
  items: NotificationsView['notifications'],
  sticky: ReadonlySet<string>,
): { items: NotificationsView['notifications']; sticky: ReadonlySet<string> } {
  const next = new Set<string>();
  for (const item of items) {
    if (!item.read || sticky.has(item.id)) next.add(item.id);
  }
  return { items: items.filter((item) => next.has(item.id)), sticky: next };
}

/** The empty membership a filter starts from, shared so switching to "All"
 *  costs no allocation. */
export const NO_STICKY: ReadonlySet<string> = new Set<string>();

/**
 * Move rows between read and unread, one row or one folded run at a time.
 *
 * The cache is patched before the request leaves, so the control answers in the
 * frame it was pressed. A rejected write is put back at once rather than left
 * for the refetch: a dot that flips, sits wrong for a second and then snaps
 * back is the most confusing way to say a write did not happen.
 */
export function useReadState(): {
  markRead: (ids: string[]) => void;
  markUnread: (ids: string[]) => void;
} {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const key = userQueries.notifications().queryKey;
    const patch = (ids: string[], read: boolean) => {
      queryClient.setQueryData(key, (prev: NotificationsView | undefined) =>
        prev ? applyRead(prev, ids, read) : prev,
      );
    };
    const settle = () => {
      void queryClient.invalidateQueries({ queryKey: key });
    };
    const write = (ids: string[], read: boolean) => {
      if (ids.length === 0) return;
      patch(ids, read);
      const client = kromaClient();
      const sent = read ? client.markNotificationsRead(ids) : client.markNotificationsUnread(ids);
      sent.then(settle, () => {
        patch(ids, !read);
        settle();
      });
    };
    return {
      markRead: (ids: string[]) => write(ids, true),
      markUnread: (ids: string[]) => write(ids, false),
    };
  }, [queryClient]);
}

/** `everOpened` latches, so the inbox is not fetched on every page load merely
 * to render a bell. */
export function usePanelState(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  everOpened: boolean;
} {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  return {
    open,
    everOpened,
    // The latch only ever goes true: closing must not unmount the inbox query,
    // or every reopen would refetch from scratch.
    setOpen: (next: boolean) => {
      if (next) setEverOpened(true);
      setOpen(next);
    },
  };
}
