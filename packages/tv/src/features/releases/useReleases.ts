import type { ReleasesView } from '@kromatv/client/releases';
import { useEffect, useState } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useClient } from '#tv/app/router';

/** Null until the session is ready and the list has landed, and whenever the
 *  request fails. */
export function useReleases(): ReleasesView | null {
  const client = useClient();
  const { ready, user } = useAuth();
  const [view, setView] = useState<ReleasesView | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    client.releases
      .list()
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, ready, user]);

  return view;
}
