// The phone's notification centre, in data form: the inbox, the unread count,
// and the socket that keeps both live.
//
// Same contract as the web bell (`features/notifications/use-notifications`):
// the server pushes `notification.created` / `notification.read` ADDRESSED to
// the recipient, so anything arriving on this socket is ours by construction and
// needs no filtering. The event carries the authoritative unread total, so the
// badge is patched straight from it - a phone that never opens the screen still
// shows the right number - while the list is only marked stale, which an open
// screen refetches and a closed one does not.

import { type KromaClient, KromaEvents, type NotificationsView } from '@kroma/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useClient, useSession } from '#mobile/lib/session';

export type { Notification } from '@kroma/core';
export { mobileRoute } from './route';

const KEY = ['notifications'] as const;

/** Open the stream while signed in. Mounted once, near the root. */
export function useNotificationStream(): void {
  const { status, client } = useSession();
  const queryClient = useQueryClient();
  const signedIn = status === 'signedIn';
  const baseUrl = client?.baseUrl;

  useEffect(() => {
    if (!signedIn || !baseUrl) return;
    const events = new KromaEvents(baseUrl, {
      onEvent: (e) => {
        if (e.type !== 'notification.created' && e.type !== 'notification.read') return;
        queryClient.setQueryData(KEY, (prev: NotificationsView | undefined) =>
          prev ? { ...prev, unread: e.unread } : prev,
        );
        void queryClient.invalidateQueries({ queryKey: KEY, refetchType: 'active' });
      },
    });
    events.connect();
    return () => events.close();
  }, [signedIn, baseUrl, queryClient]);
}

/** The one query behind both hooks below, so the list and the badge cannot end
 * up on different cache policies. */
function inbox(client: KromaClient) {
  return {
    queryKey: KEY,
    queryFn: () => client.listNotifications(),
    staleTime: 30_000,
  };
}

/** The inbox, newest first, with its unread tally. */
export function useNotifications() {
  return useQuery(inbox(useClient()));
}

/** Just the badge number, for the bell. */
export function useUnreadCount(): number {
  const { data } = useQuery({
    ...inbox(useClient()),
    select: (v: NotificationsView) => v.unread,
  });
  return data ?? 0;
}

/** Refetch the inbox after a write (read / delete / an action). */
export function useRefreshNotifications(): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: KEY });
}
