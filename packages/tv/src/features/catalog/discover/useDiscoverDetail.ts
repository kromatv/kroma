import { type DiscoverDetail, tmdbKindOf } from '@kromatv/client/discovery';
import type { RequestKind } from '@kromatv/client/requests';
import { useEffect, useState } from 'react';
import { useClient } from '#tv/app/router';

type DiscoverFiche =
  | { state: 'reading' }
  | { state: 'read'; detail: DiscoverDetail }
  | { state: 'refused' };

const READING: DiscoverFiche = { state: 'reading' };

export function useDiscoverDetail(kind: RequestKind, tmdbId: number): DiscoverFiche {
  const client = useClient();
  const [settled, setSettled] = useState<{
    client: typeof client;
    kind: RequestKind;
    tmdbId: number;
    fiche: DiscoverFiche;
  } | null>(null);

  useEffect(() => {
    let live = true;
    client.discovery.detail(tmdbKindOf(kind), tmdbId).then(
      (detail) => {
        if (live) setSettled({ client, kind, tmdbId, fiche: { state: 'read', detail } });
      },
      () => {
        if (live) setSettled({ client, kind, tmdbId, fiche: { state: 'refused' } });
      },
    );
    return () => {
      live = false;
    };
  }, [client, kind, tmdbId]);

  return settled?.client === client && settled.kind === kind && settled.tmdbId === tmdbId
    ? settled.fiche
    : READING;
}
