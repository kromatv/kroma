import type { NotificationId } from '@kromatv/client/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/**
 * Put rows away and bring them back. Both shelves are refetched once the server
 * has answered, since a row moves from one list to the other and only the
 * server knows the order it lands in.
 */
export function useArchive(): {
  archiveRead: () => Promise<void>;
  unarchive: (ids: NotificationId[]) => Promise<void>;
} {
  const webRuntime = useWebRuntime();

  const queryClient = useQueryClient();
  return useMemo(() => {
    const { notifications, archivedNotifications } = webRuntime.queries.userQueries;
    const settle = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notifications().queryKey }),
        queryClient.invalidateQueries({ queryKey: archivedNotifications().queryKey }),
      ]);
    };
    return {
      archiveRead: async () => {
        await webRuntime.client.notifications.archiveRead().finally(settle);
      },
      unarchive: async (ids: NotificationId[]) => {
        if (ids.length === 0) return;
        await webRuntime.client.notifications.unarchive(ids).finally(settle);
      },
    };
  }, [queryClient, webRuntime.queries.userQueries, webRuntime.client]);
}
