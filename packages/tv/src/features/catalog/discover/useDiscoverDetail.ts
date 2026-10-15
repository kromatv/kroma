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
  const [fiche, setFiche] = useState<DiscoverFiche>(READING);

  useEffect(() => {
    let live = true;
    setFiche(READING);
    client.discovery.detail(tmdbKindOf(kind), tmdbId).then(
      (detail) => {
        if (live) setFiche({ state: 'read', detail });
      },
      () => {
        if (live) setFiche({ state: 'refused' });
      },
    );
    return () => {
      live = false;
    };
  }, [client, kind, tmdbId]);

  return fiche;
}
