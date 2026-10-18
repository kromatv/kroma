import { apiBase, type WebRuntime } from '#web/shared/lib/api';
import { useKromaClient, useWebRuntime } from '#web/shared/lib/web-runtime';
// Keep an open catalog fiche fresh without a manual reload. The server enriches
// metadata in the background (a scan, a nightly pass, or an operator correcting
// the TMDB match), then broadcasts `item.updated` / `show.updated` over the event
// stream. This hook listens for the ONE id the page is showing and invalidates
// its cache entry, so the new poster/title/synopsis swap in on their own.
//
// Bursts are coalesced (an enrich pass emits many updates for the same
// id) into a single refetch.

import { KromaEvents } from '@kromatv/client/events';
import { ItemId, ShowId } from '@kromatv/client/media';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const subjectKey = (
  kind: 'item' | 'show',
  id: string,
  webRuntime: WebRuntime,
): readonly unknown[] =>
  kind === 'show'
    ? webRuntime.queries.catalogQueries.show(ShowId.parse(id)).queryKey
    : webRuntime.queries.catalogQueries.item(ItemId.parse(id)).queryKey;

export function useCatalogLiveRefresh(kind: 'item' | 'show', id: string): void {
  const eventClient = useKromaClient();

  const webRuntime = useWebRuntime();

  const queryClient = useQueryClient();
  useEffect(() => {
    const want = kind === 'show' ? 'show.updated' : 'item.updated';
    let pending: ReturnType<typeof setTimeout> | null = null;
    const ev = new KromaEvents(apiBase(), {
      token: () => eventClient.sessionToken,
      refresh: () => eventClient.refreshSession(),

      onEvent: (e) => {
        if (e.type !== want || e.id !== id || pending) return;
        pending = setTimeout(() => {
          pending = null;
          void queryClient.invalidateQueries({ queryKey: subjectKey(kind, id, webRuntime) });
        }, 600);
      },
    });
    ev.connect();
    return () => {
      if (pending) clearTimeout(pending);
      ev.close();
    };
  }, [kind, id, queryClient, webRuntime, eventClient.sessionToken, eventClient.refreshSession]);
}
