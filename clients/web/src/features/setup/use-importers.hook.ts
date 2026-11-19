import type { Importer, ImporterList } from '@kromatv/client/importers';
import type { ModuleId } from '@kromatv/client/modules';
import { useQuery } from '@tanstack/react-query';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const IMPORTERS_QUERY = ['setup', 'importers'] as const;
const ASK_AGAIN_MS = 1500;

function find(list: ImporterList | undefined, id: ModuleId | null): Importer | null {
  return list?.importers.find((held) => held.id === id) ?? null;
}

/** Whether the list must be asked again: the importer the owner chose is
 * known and cannot be asked yet, because it installs or it starts. */
export function stillStarting(list: ImporterList | undefined, id: ModuleId | null): boolean {
  const chosen = find(list, id);
  return chosen !== null && !chosen.running;
}

/** The importers the server can use: the installed ones, then the ones the
 * official registry offers. */
export function useImporters() {
  const { client } = useWebRuntime();
  return useQuery({ queryKey: IMPORTERS_QUERY, queryFn: () => client.importers.list() });
}

/** One importer by id, asked again until it runs. */
export function useImporter(id: ModuleId | null): Importer | null {
  const { client } = useWebRuntime();
  const { data } = useQuery({
    queryKey: IMPORTERS_QUERY,
    queryFn: () => client.importers.list(),
    refetchInterval: (query) => (stillStarting(query.state.data, id) ? ASK_AGAIN_MS : false),
  });
  return find(data, id);
}
