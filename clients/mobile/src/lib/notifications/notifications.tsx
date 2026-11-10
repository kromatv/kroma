// The phone's notification centre, in data form: the inbox and the archive, the
// counts, and the socket that keeps them live. The server addresses each event
// to its recipient, so anything arriving on this socket is ours and needs no
// filtering; its counts are authoritative, while the list is only marked stale.

import { KromaEvents } from '@kromatv/client/events';
import type { NotificationsView } from '@kromatv/client/notifications';
import type { QueryClient } from '@kromatv/client/query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useClient, useSession } from '#mobile/lib/session';

export type { Notification } from '@kromatv/client/notifications';
export { mobileRoute, subjectRoute } from './route';

/** Opens the stream while signed in. Mount once, near the root. */
export function useNotificationStream(): void {
  const { status, client } = useSession();
  const queryClient = useQueryClient();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn || !client) return;
    const { queryKey } = client.query.notifications.list();
    const events = new KromaEvents(client.baseUrl, {
      token: () => client.sessionToken,
      refresh: () => client.refreshSession(),
      onEvent: (e) => {
        if (e.type !== 'notification.created' && e.type !== 'notification.read') return;
        const counts = { unread: e.unread, unseen: e.unseen ?? e.unread };
        queryClient.setQueryData(queryKey, (prev: NotificationsView | undefined) =>
          prev ? { ...prev, ...counts } : prev,
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

/** The rows put away. Only a server that keeps an archive is asked. */
export function useArchivedNotifications(enabled: boolean) {
  const client = useClient();
  return useQuery({
    ...client.query.notifications.list({ archived: true }),
    staleTime: 30_000,
    enabled,
  });
}

export function useUnreadCount(): number {
  const { data } = useQuery({
    ...inbox(useClient()),
    select: (v: NotificationsView) => v.unread,
  });
  return data ?? 0;
}

/** What the bell counts: rows not seen since the inbox was last open. */
export function useUnseenCount(): number {
  const { data } = useQuery({
    ...inbox(useClient()),
    select: (v: NotificationsView) => v.unseen,
  });
  return data ?? 0;
}

/** Clears the bell: everything in the inbox counts as seen once it has been
 * open. A server too old to know "seen" refuses the call, and the refetch puts
 * its unread count back on the bell. */
export function useMarkSeen(): () => void {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMemo(() => {
    const { queryKey } = client.query.notifications.list();
    return () => {
      const current = queryClient.getQueryData<NotificationsView>(queryKey);
      if (!current || current.unseen === 0) return;
      queryClient.setQueryData(queryKey, { ...current, unseen: 0 });
      const settle = () => void queryClient.invalidateQueries({ queryKey });
      client.notifications.markSeen().then(settle, settle);
    };
  }, [client, queryClient]);
}

export function useRefreshNotifications(): () => void {
  const queryClient = useQueryClient();
  const { queryKey } = useClient().query.notifications.list();
  return () => void queryClient.invalidateQueries({ queryKey });
}
