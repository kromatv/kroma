import { KromaEvents, type ServerEvent } from '@kromatv/client/events';
import { ItemId, ShowId } from '@kromatv/client/media';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiBase, type WebRuntime } from '#web/shared/lib/api';
import { useKromaClient, useWebRuntime } from '#web/shared/lib/web-runtime';

const SUBJECT_WINDOW_MS = 600;
const HOME_WINDOW_MS = 2500;

const HOME_TRIGGERS: ReadonlySet<string> = new Set<ServerEvent['type']>([
  'scan.completed',
  'library.updated',
  'item.updated',
  'show.updated',
  'enrich.completed',
]);

interface Watch {
  client: WebRuntime['client'];
  wants: (event: ServerEvent) => boolean;
  refresh: () => void;
  windowMs: number;
}

function watchEvents({ client, wants, refresh, windowMs }: Watch): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;
  const events = new KromaEvents(apiBase(), {
    token: () => client.sessionToken,
    refresh: () => client.refreshSession(),
    onEvent: (event) => {
      if (pending || !wants(event)) {
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        refresh();
      }, windowMs);
    },
  });
  events.connect();
  return () => {
    if (pending) {
      clearTimeout(pending);
    }
    events.close();
  };
}

const subjectKey = (kind: 'item' | 'show', id: string, webRuntime: WebRuntime): QueryKey =>
  kind === 'show'
    ? webRuntime.queries.catalogQueries.show(ShowId.parse(id)).queryKey
    : webRuntime.queries.catalogQueries.item(ItemId.parse(id)).queryKey;

const homeKeys = ({ queries: { userQueries, catalogQueries } }: WebRuntime): QueryKey[] => [
  userQueries.home().queryKey,
  catalogQueries.featured().queryKey,
  catalogQueries.moviesView().queryKey,
  catalogQueries.showsView().queryKey,
];

/** Keeps an open title page fresh without a reload: an `item.updated` or
 * `show.updated` for the one id on screen refetches it, and a burst of them
 * (an enrich pass emits many for the same id) refetches it once. */
export function useCatalogLiveRefresh(kind: 'item' | 'show', id: string): void {
  const client = useKromaClient();
  const webRuntime = useWebRuntime();
  const queryClient = useQueryClient();
  useEffect(() => {
    const want = kind === 'show' ? 'show.updated' : 'item.updated';
    return watchEvents({
      client,
      wants: (event) => event.type === want && event.id === id,
      refresh: () => {
        void queryClient.invalidateQueries({ queryKey: subjectKey(kind, id, webRuntime) });
      },
      windowMs: SUBJECT_WINDOW_MS,
    });
  }, [kind, id, queryClient, webRuntime, client]);
}

/** Keeps the home fresh while a scan fills the catalogue: the end of the walk,
 * each title matched and the end of matching refetch what the home reads, once
 * per window however many arrive in it, the last of them included. A server
 * that announces none of these is asked nothing. */
export function useHomeLiveRefresh(): void {
  const client = useKromaClient();
  const webRuntime = useWebRuntime();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      watchEvents({
        client,
        wants: (event) => HOME_TRIGGERS.has(event.type),
        refresh: () => {
          for (const queryKey of homeKeys(webRuntime)) {
            void queryClient.invalidateQueries({ queryKey });
          }
        },
        windowMs: HOME_WINDOW_MS,
      }),
    [queryClient, webRuntime, client],
  );
}
