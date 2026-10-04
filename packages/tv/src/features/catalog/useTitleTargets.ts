import type { ShowId, UpNext } from '@kromatv/client/media';
import { useEffect, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useClient, useNav } from '#tv/app/router';

/** The episode a series continues with, as the series screen asks for it;
 * null until the server answers, and for no series at all. */
export function useUpNext(showId: ShowId | null): UpNext | null {
  const client = useClient();
  const [answer, setAnswer] = useState<{ showId: ShowId; next: UpNext | null } | null>(null);
  useEffect(() => {
    if (showId === null) return;
    let cancelled = false;
    client.playback
      .upNext(showId)
      .then((next) => {
        if (!cancelled) setAnswer({ showId, next });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, showId]);
  return answer?.showId === showId ? answer.next : null;
}

/** Opens a series' screen from its id: the loaded catalogue's copy when it
 * holds one, else the server's. */
export function useOpenShow(): (showId: ShowId) => void {
  const nav = useNav();
  const client = useClient();
  const { shows } = useConnection();
  return (showId) => {
    const known = shows.find((show) => show.id === showId);
    if (known) {
      nav.go('show', { show: known });
      return;
    }
    client.media.show(showId).then(
      (detail) => nav.go('show', { show: detail.show }),
      () => undefined,
    );
  };
}
