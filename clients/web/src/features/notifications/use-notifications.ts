// Keep the bell live. The server pushes `notification.created` /
// `notification.read` over the event stream, ADDRESSED to the recipient — a
// socket only ever receives its own account's, so anything that arrives here is
// by definition ours and needs no filtering.
//
// Both events carry the new unread total, so the badge updates from the event
// itself; the list is refetched too, which an open panel picks up.

import { KromaEvents, type NotificationsView } from '@kroma/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiBase } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';

/** Subscribe to notification pushes and keep the cached inbox + badge in sync. */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (e.type !== 'notification.created' && e.type !== 'notification.read') return;
        // Patch the badge straight from the event's own count first, so it is
        // right even when the panel is closed and the list is never refetched.
        queryClient.setQueryData(
          userQueries.notifications().queryKey,
          (prev: NotificationsView | undefined) => (prev ? { ...prev, unread: e.unread } : prev),
        );
        void queryClient.invalidateQueries({ queryKey: userQueries.notifications().queryKey });
      },
    });
    ev.connect();
    return () => ev.close();
  }, [queryClient]);
}

/** The unread count for the bell badge, kept live by {@link useNotificationStream}. */
export function useUnreadCount(): number {
  const { data } = useQuery({ ...userQueries.notifications(), select: (v) => v.unread });
  return data ?? 0;
}

/** Panel open-state that remembers whether it has ever been opened, so the inbox
 * is not fetched on every page load merely to render a bell. */
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
    // Wraps the setter so the latch flips on the same click that opens the
    // panel. It only ever goes true: closing the panel must not unmount the
    // inbox query, or every reopen would refetch from scratch.
    setOpen: (next: boolean) => {
      if (next) setEverOpened(true);
      setOpen(next);
    },
  };
}
