// The phone's notification centre, in data form: the inbox, the unread count,
// and the socket that keeps both live. The server addresses each event to its
// recipient, so anything arriving on this socket is ours and needs no filtering;
// its unread total is authoritative, while the list is only marked stale.

import { KromaEvents } from '@kroma/client/events';
import type { NotificationsView } from '@kroma/client/notifications';
import type { QueryClient } from '@kroma/client/query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useClient, useSession } from '#mobile/lib/session';

export type { Notification } from '@kroma/client/notifications';
export { mobileRoute } from './route';

/** Opens the stream while signed in. Mount once, near the root. */
export function useNotificationStream(): void {
  const { status, client } = useSession();
  const queryClient = useQueryClient();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn || !client) return;
    const { queryKey } = client.query.notifications.list();
    const events = new KromaEvents(client.baseUrl, {
      onEvent: (e) => {
        if (e.type !== 'notification.created' && e.type !== 'notification.read') return;
        queryClient.setQueryData(queryKey, (prev: NotificationsView | undefined) =>
          prev ? { ...prev, unread: e.unread } : prev,
        );
        void queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      },
    });
    events.connect();
    return () => events.close();
  }, [signedIn, client, queryClient]);
}

function inbox(client: QueryClient) {
  return { ...client.query.notifications.list(), staleTime: 30_000 };
}

/** The inbox, newest first. */
export function useNotifications() {
  return useQuery(inbox(useClient()));
}

export function useUnreadCount(): number {
  const { data } = useQuery({
    ...inbox(useClient()),
    select: (v: NotificationsView) => v.unread,
  });
  return data ?? 0;
}

export function useRefreshNotifications(): () => void {
  const queryClient = useQueryClient();
  const { queryKey } = useClient().query.notifications.list();
  return () => void queryClient.invalidateQueries({ queryKey });
}
