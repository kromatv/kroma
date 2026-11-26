import type { NotificationPrefs, PrefsUpdate } from '@kromatv/client/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The account's delivery matrix, and `save`, which sends one switch's update and keeps
 *  what the server answers. `enabled: false` asks the server nothing. */
export function useNotificationPrefs({ enabled = true }: Readonly<{ enabled?: boolean }> = {}): {
  prefs: NotificationPrefs | undefined;
  save: (update: PrefsUpdate) => Promise<void>;
} {
  const webRuntime = useWebRuntime();
  const queryClient = useQueryClient();
  const { data } = useQuery({ ...webRuntime.queries.userQueries.notificationPrefs(), enabled });
  const save = useCallback(
    async (update: PrefsUpdate) => {
      const saved = await webRuntime.client.notifications.setPrefs(update);
      queryClient.setQueryData(webRuntime.queries.userQueries.notificationPrefs().queryKey, saved);
    },
    [webRuntime, queryClient],
  );
  return { prefs: data, save };
}
