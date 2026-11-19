import { KromaEvents, type ServerEvent } from '@kromatv/client/events';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  arrivals,
  type ScanFeed,
  type ScannedTitle,
  scanCounts,
} from '#web/features/setup/scan-feed';
import { apiBase, type WebRuntime } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const REFRESH_MS = 1200;

const CHANGES: ReadonlySet<ServerEvent['type']> = new Set([
  'scan.completed',
  'library.updated',
  'item.updated',
  'show.updated',
  'enrich.completed',
]);

function useLibraryTitles({ enabled }: { enabled: boolean }): ScannedTitle[] {
  const { queries } = useWebRuntime();
  const movies = useQuery({ ...queries.catalogQueries.moviesView(), enabled });
  const shows = useQuery({ ...queries.catalogQueries.showsView(), enabled });
  const films = (movies.data ?? []).map((card) => ({
    id: card.id,
    poster: card.poster,
    matched: Boolean(card.metadata?.posterUrl),
  }));
  const series = (shows.data ?? []).map((show) => ({
    id: show.id,
    poster: show.poster,
    matched: Boolean(show.metadata?.posterUrl),
  }));
  return [...films, ...series];
}

interface ScanWatch {
  client: WebRuntime['client'];
  refresh: () => void;
  onWalking: (walking: boolean) => void;
}

function watchScan({ client, refresh, onWalking }: ScanWatch): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;
  const refreshLater = () => {
    pending = null;
    refresh();
  };
  const events = new KromaEvents(apiBase(), {
    token: () => client.sessionToken,
    refresh: () => client.refreshSession(),
    onEvent: (event) => {
      if (event.type === 'scan.started' || event.type === 'scan.completed') {
        onWalking(event.type === 'scan.started');
      }
      if (CHANGES.has(event.type) && !pending) {
        pending = setTimeout(refreshLater, REFRESH_MS);
      }
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

function useScanEvents({ enabled }: { enabled: boolean }): boolean {
  const { client, queries } = useWebRuntime();
  const queryClient = useQueryClient();
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: queries.catalogQueries.moviesView().queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: queries.catalogQueries.showsView().queryKey });
    };
    return watchScan({ client, refresh, onWalking: setWalking });
  }, [enabled, client, queries, queryClient]);
  return walking;
}

function sameOrder(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((poster, at) => poster === other[at]);
}

function useArrivals(titles: readonly ScannedTitle[]): string[] {
  const [seen, setSeen] = useState<string[]>([]);
  const posters = arrivals(seen, titles);
  if (!sameOrder(posters, seen)) {
    setSeen(posters);
  }
  return posters;
}

/** A scan as the owner watches it: how much the library holds, how much of it
 * is matched, and the posters as they arrive. It listens to the server and
 * asks again at most once per `REFRESH_MS`. Nothing is asked of a visitor who
 * is not signed in. */
export function useScanFeed(): ScanFeed {
  const { user } = useAuth();
  const enabled = Boolean(user);
  const titles = useLibraryTitles({ enabled });
  const walking = useScanEvents({ enabled });
  const posters = useArrivals(titles);
  return { ...scanCounts(titles, { walking }), posters };
}
