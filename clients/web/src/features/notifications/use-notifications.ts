// The server addresses `notification.created` / `notification.read` to the
// recipient: a socket only ever receives its own account's, so nothing that
// arrives here needs filtering.

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
