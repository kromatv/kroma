// The request page's two ledger queries, keyed once so every part of the page
// that needs them shares one fetch: the header card wants the artwork and the
// library link, the acquisition panel wants the seasons.

import type { RequestId } from '@kroma/client/requests';
import { useAdminHost } from '@kroma/module-sdk';
import { useQuery } from '@tanstack/react-query';

const FRESH_MS = 60_000;

export function useRequestLedger(id: RequestId, enabled: boolean) {
  const { client } = useAdminHost();
  return useQuery({
    queryKey: ['admin', 'requests', id, 'ledger'],
    queryFn: () => client.requests.ledger(id),
    enabled,
    staleTime: FRESH_MS,
  });
}

/** One season's episodes. Off until a season is open: the whole point of the
 * split is that a twenty-season show costs one TMDB call per season looked at. */
export function useSeasonLedger(id: RequestId, season: number | null) {
  const { client } = useAdminHost();
  return useQuery({
    queryKey: ['admin', 'requests', id, 'ledger', season],
    queryFn: () => client.requests.seasonLedger(id, season as number),
    enabled: season != null,
    staleTime: FRESH_MS,
  });
}
