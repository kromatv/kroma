import type { ImportServer } from '@kromatv/client/importers';
import type { ModuleId } from '@kromatv/client/modules';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const FOUND_FOR_MS = 30_000;
const NOTHING: readonly ImportServer[] = [];

/** The servers an importer finds on the local network. Looked for once while
 * its screen shows; a failed search finds nothing. */
export function useFoundServers(importer: ModuleId | null) {
  const { client } = useWebRuntime();
  const found = useQuery({
    queryKey: ['setup', 'import-found', importer],
    queryFn:
      importer === null
        ? skipToken
        : async () => (await client.importers.discover(importer)).servers,
    staleTime: FOUND_FOR_MS,
    retry: false,
  });
  return { servers: found.data ?? NOTHING, looking: found.isLoading };
}
