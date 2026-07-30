// One client for the SPA, so a route loader's fetch is the same cache entry the
// component reads. Only mount a suspense query once `ready && user`.
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Catalogue data is stable within a visit: instant on back-nav.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // A 401 self-refreshes in the client, so a hard failure is a real error.
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryClient = makeQueryClient();
