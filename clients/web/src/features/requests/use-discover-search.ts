import { useWebRuntime } from '#web/shared/lib/web-runtime';
// Debounced dual search: the local catalog (always) + TMDB discovery (gated
// on requests.create). Backed by TanStack Query (dedup + cache); latest-wins is
// handled by the query key changing per (query, type).

import { hasPermission } from '@kromatv/client/accounts';
import type { DiscoverEntry, DiscoverType } from '@kromatv/client/discovery';
import type { SearchHit } from '@kromatv/client/media';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '#web/shared/lib/auth';
import { useDebouncedValue } from '#web/shared/lib/use-debounced-value';

export interface DiscoverSearchState {
  loading: boolean;
  local: SearchHit[];
  discover: DiscoverEntry[];
  canDiscover: boolean;
}

export function useDiscoverSearch(query: string, type: DiscoverType): DiscoverSearchState {
  const webRuntime = useWebRuntime();

  const { user } = useAuth();
  const canDiscover = !!user && hasPermission(user, 'requests.create');
  const q = useDebouncedValue(query.trim(), 250);

  const { data, isFetching } = useQuery({
    queryKey: ['discoverSearch', q, type, canDiscover],
    queryFn: async () => {
      const c = webRuntime.client;
      const [local, discover] = await Promise.all([
        c.media
          .search(q, { limit: 24 })
          .then((r) => r.results)
          .catch(() => [] as SearchHit[]),
        canDiscover
          ? c.discovery
              .search(q, { type })
              .then((r) => r.results)
              .catch(() => [] as DiscoverEntry[])
          : Promise.resolve<DiscoverEntry[]>([]),
      ]);
      // The type filter also narrows the local library hits: `movie` keeps
      // movies; `tv` keeps shows + episodes; `all` keeps everything.
      const filteredLocal =
        type === 'all'
          ? local
          : local.filter((h) => (type === 'movie' ? h.type === 'movie' : h.type !== 'movie'));
      return { local: filteredLocal, discover };
    },
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });

  return {
    loading: q.length > 0 && isFetching,
    local: data?.local ?? [],
    discover: data?.discover ?? [],
    canDiscover,
  };
}

export interface TrendingState {
  loading: boolean;
  entries: DiscoverEntry[];
}

/** This week's trending movies + shows, for the browse-first empty state.
 * Fetched once when `enabled` (the user can discover). */
export function useTrending(enabled: boolean): TrendingState {
  const webRuntime = useWebRuntime();

  const { data, isFetching } = useQuery({
    queryKey: ['discover', 'trending', 'all'],
    queryFn: () => webRuntime.client.discovery.trending(),
    enabled,
    select: (r) => r.results,
  });
  return { loading: enabled && isFetching && data === undefined, entries: data ?? [] };
}

export interface TrendingPageState {
  loading: boolean;
  entries: DiscoverEntry[];
  totalPages: number;
}

/** One page of trending titles for a single kind (`movie` | `tv`).
 * `keepPreviousData` retains the prior page (and its total) while the next loads. */
export function useTrendingPage(
  type: 'movie' | 'tv',
  page: number,
  enabled: boolean,
): TrendingPageState {
  const webRuntime = useWebRuntime();

  const { data, isFetching } = useQuery({
    ...webRuntime.queries.discoverQueries.trending(type, page),
    enabled,
    placeholderData: keepPreviousData,
  });
  return {
    loading: enabled && isFetching,
    entries: data?.results ?? [],
    totalPages: data?.totalPages ?? 1,
  };
}
