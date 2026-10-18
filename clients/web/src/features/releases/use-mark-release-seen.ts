import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

export function useMarkReleaseSeen(unseen: string | null): void {
  const webRuntime = useWebRuntime();

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!unseen) return;
    void webRuntime.client.releases
      .markSeen(unseen)
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: webRuntime.queries.userQueries.releases().queryKey,
        }),
      )
      .catch(() => undefined);
  }, [
    unseen,
    queryClient,
    webRuntime.queries.userQueries.releases,
    webRuntime.client.releases.markSeen,
  ]);
}
