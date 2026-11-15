import type { WebRuntime } from '#web/shared/lib/api';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
// Debounced dual search: the local catalog (always) + TMDB discovery (gated
// on requests.create). Backed by TanStack Query (dedup + cache); latest-wins is
// handled by the query key changing per (query, type).

import { hasPermission } from '@kromatv/client/accounts';
import type { DiscoverEntry, DiscoverType } from '@kromatv/client/discovery';
import type { PersonHit, SearchHit } from '@kromatv/client/media';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '#web/shared/lib/auth';
import { useDebouncedValue } from '#web/shared/lib/use-debounced-value';

export interface DiscoverSearchState {
  loading: boolean;
  local: SearchHit[];
  people: PersonHit[];
  discover: DiscoverEntry[];
  canDiscover: boolean;
}

const NO_LOCAL: { results: SearchHit[]; people: PersonHit[] } = { results: [], people: [] };
const NO_DISCOVER: DiscoverEntry[] = [];

const NOTHING_FOUND = { local: NO_LOCAL.results, people: NO_LOCAL.people, discover: NO_DISCOVER };

function narrowLocal(local: SearchHit[], type: DiscoverType): SearchHit[] {
  if (type === 'all') {
    return local;
  }
  return local.filter((h) => (type === 'movie' ? h.type === 'movie' : h.type !== 'movie'));
}

interface SearchScope {
  client: WebRuntime['client'];
  q: string;
  type: DiscoverType;
  canDiscover: boolean;
}

function searchDiscovery({ client, q, type, canDiscover }: Readonly<SearchScope>) {
  if (!canDiscover) {
    return Promise.resolve(NO_DISCOVER);
  }
  return client.discovery
    .search(q, { type })
    .then((r) => r.results)
    .catch(() => NO_DISCOVER);
}

async function searchEverywhere(scope: Readonly<SearchScope>) {
  const { client, q, type } = scope;
  const [{ results, people }, discover] = await Promise.all([
    client.media.search(q, { limit: 24 }).catch(() => NO_LOCAL),
    searchDiscovery(scope),
  ]);
  return { local: narrowLocal(results, type), people, discover };
}

function useCanDiscover(): boolean {
  const { user } = useAuth();
  return !!user && hasPermission(user, 'requests.create');
}

export function useDiscoverSearch(query: string, type: DiscoverType): DiscoverSearchState {
  const { client } = useWebRuntime();
  const canDiscover = useCanDiscover();
  const q = useDebouncedValue(query.trim(), 250);
  const searching = q.length > 0;

  const { data, isFetching } = useQuery({
    queryKey: ['discoverSearch', q, type, canDiscover],
    queryFn: () => searchEverywhere({ client, q, type, canDiscover }),
    enabled: searching,
    placeholderData: keepPreviousData,
  });

  return {
    loading: searching && isFetching && data === undefined,
    ...(data ?? NOTHING_FOUND),
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
