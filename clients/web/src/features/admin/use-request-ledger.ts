// The request's TMDB ledger, for the page's own header card: the artwork, the
// synopsis and the catalog entry the library already holds.
//
// A CORE endpoint, so the console reads it directly. The acquisition module
// reads the same one for its catalogue under the same query key, so the two
// share a single fetch rather than racing for it.

import type { RequestId } from '@kroma/client/requests';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '#web/shared/lib/auth';

export function useRequestLedger(id: RequestId, enabled: boolean) {
  const { client } = useAuth();
  return useQuery({
    queryKey: ['admin', 'requests', id, 'ledger'],
    queryFn: () => client.requests.ledger(id),
    enabled,
    staleTime: 60_000,
  });
}
