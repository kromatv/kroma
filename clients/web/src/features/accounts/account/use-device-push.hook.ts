import { disablePush, enablePush, type PushBlocker } from '@kromatv/client/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { pushBlocker, webPush } from '#web/shared/lib/push';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const subscribeNever = () => () => {};

/** Whether this device receives pushes, what stops it when the browser cannot, and
 *  `setSubscribed`, which turns it on or off on both sides. `enabled: false` asks the
 *  server nothing. */
export function useDevicePush({ enabled = true }: Readonly<{ enabled?: boolean }> = {}): {
  blocker: PushBlocker | null;
  subscribed: boolean;
  setSubscribed: (on: boolean) => Promise<void>;
} {
  const webRuntime = useWebRuntime();
  const queryClient = useQueryClient();
  const blocker = useSyncExternalStore(subscribeNever, pushBlocker, () => null);
  const { data } = useQuery({ ...webRuntime.queries.userQueries.pushKey(), enabled });
  const setSubscribed = useCallback(
    async (on: boolean) => {
      const turn = on ? enablePush : disablePush;
      await turn(webPush, webRuntime.client);
      await queryClient.invalidateQueries({
        queryKey: webRuntime.queries.userQueries.pushKey().queryKey,
      });
    },
    [webRuntime, queryClient],
  );
  return { blocker, subscribed: data?.subscribed ?? false, setSubscribed };
}
