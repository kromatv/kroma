// The phone's notification centre, in data form: the inbox, the unread count,
// and the socket that keeps both live. The server addresses each event to its
// recipient, so anything arriving on this socket is ours and needs no filtering;
// its unread total is authoritative, while the list is only marked stale.

import { type KromaClient, KromaEvents, type NotificationsView } from '@kroma/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useClient, useSession } from '#mobile/lib/session';

export type { Notification } from '@kroma/core';
export { mobileRoute } from './route';

const KEY = ['notifications'] as const;

/** Opens the stream while signed in. Mount once, near the root. */
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

function inbox(client: KromaClient) {
  return {
    queryKey: KEY,
    queryFn: () => client.listNotifications(),
    staleTime: 30_000,
  };
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
  return () => void queryClient.invalidateQueries({ queryKey: KEY });
}
