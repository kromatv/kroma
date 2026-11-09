import type { KromaClient } from '@kromatv/client';
import type { TmdbKind } from '@kromatv/client/discovery';
import type { Trailer } from '@kromatv/client/trailers';
import { playableTrailer } from '@kromatv/core';
import { useEffect, useState } from 'react';
import { useClient } from '#tv/app/router';

interface Settled {
  client: KromaClient;
  kind: TmdbKind;
  tmdbId: number;
  trailer: Trailer | null;
}

/** The trailer a title's button plays, or null while the server has not said,
 * when it cannot play one, when the title has no TMDB id, and when the list
 * could not be read. */
export function usePlayableTrailer(
  kind: TmdbKind,
  tmdbId: number | null | undefined,
): Trailer | null {
  const client = useClient();
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (tmdbId == null) return;
    let live = true;
    client.trailers.list(kind, tmdbId).then(
      (list) => {
        if (live) setSettled({ client, kind, tmdbId, trailer: playableTrailer(list) });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, kind, tmdbId]);

  return settled?.client === client && settled.kind === kind && settled.tmdbId === tmdbId
    ? settled.trailer
    : null;
}
