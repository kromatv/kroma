import { type DiscoverDetail, type DiscoverEntry, ItemId, ShowId } from '@kroma/core';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SavedTitle, SavedTitles } from '#web/features/catalog/saved-titles';
import { kromaClient, type MovieView, type ShowView } from '#web/shared/lib/api';

const TMDB_PREFIX = 'tmdb:';

function tmdbIdOf(id: string): number | null {
  if (!id.startsWith(TMDB_PREFIX)) return null;
  const tmdbId = Number(id.slice(TMDB_PREFIX.length));
  if (Number.isNaN(tmdbId)) return null;
  return tmdbId;
}

function tmdbIdsIn(ids: readonly string[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    const tmdbId = tmdbIdOf(id);
    if (tmdbId !== null) out.push(tmdbId);
  }
  return out;
}

function entryOf(detail: DiscoverDetail): DiscoverEntry {
  return {
    kind: detail.kind,
    tmdbId: detail.tmdbId,
    title: detail.title,
    year: detail.year,
    posterUrl: detail.posterUrl,
    backdropUrl: detail.backdropUrl,
    overview: detail.overview,
    rating: detail.rating,
    inLibrary: detail.inLibrary,
    localId: detail.localId,
    requestId: detail.requestId,
    requestStatus: detail.requestStatus,
    requestProgress: detail.requestProgress,
  };
}

async function fetchDiscoverEntry(tmdbId: number): Promise<DiscoverEntry> {
  const client = kromaClient();
  try {
    return entryOf(await client.discoverDetail('movie', tmdbId));
  } catch {
    return entryOf(await client.discoverDetail('tv', tmdbId));
  }
}

function useDiscoverEntries(tmdbIds: readonly number[]) {
  const queries = useQueries({
    queries: tmdbIds.map((tmdbId) => ({
      queryKey: ['discover', 'entry', tmdbId] as const,
      queryFn: () => fetchDiscoverEntry(tmdbId),
      retry: 1,
    })),
  });
  const entries: DiscoverEntry[] = [];
  let loading = false;
  for (const query of queries) {
    if (query.isLoading) loading = true;
    else if (query.data) entries.push(query.data);
  }
  return { entries, loading };
}

function fromMovie(movie: MovieView): SavedTitle {
  return {
    key: movie.id,
    kind: 'movie',
    title: movie.title,
    year: movie.year ?? null,
    rating: movie.metadata?.rating ?? null,
    backdrop: movie.backdrop,
    available: true,
    source: { from: 'movie', movie },
  };
}

function fromShow(show: ShowView): SavedTitle {
  return {
    key: show.id,
    kind: 'show',
    title: show.title,
    year: show.year ?? null,
    rating: show.metadata?.rating ?? null,
    backdrop: show.backdrop,
    available: true,
    source: { from: 'show', show },
  };
}

function fromDiscover(entry: DiscoverEntry): SavedTitle {
  return {
    key: `${TMDB_PREFIX}${entry.tmdbId}`,
    kind: entry.kind,
    title: entry.title,
    year: entry.year,
    rating: entry.rating,
    backdrop: entry.backdropUrl,
    available: entry.inLibrary,
    source: { from: 'discover', entry },
  };
}

function collect(
  ids: readonly string[],
  movieById: ReadonlyMap<string, MovieView>,
  showById: ReadonlyMap<string, ShowView>,
  entries: readonly DiscoverEntry[],
): SavedTitle[] {
  const entryByTmdbId = new Map(entries.map((entry) => [entry.tmdbId, entry]));
  const out: SavedTitle[] = [];
  for (const id of ids) {
    const tmdbId = tmdbIdOf(id);
    if (tmdbId !== null) {
      const entry = entryByTmdbId.get(tmdbId);
      if (entry) out.push(fromDiscover(entry));
      continue;
    }
    const movie = movieById.get(ItemId.of(id));
    if (movie) {
      out.push(fromMovie(movie));
      continue;
    }
    const show = showById.get(ShowId.of(id));
    if (show) out.push(fromShow(show));
  }
  return out;
}

/**
 * Resolves the ids of a saved list into renderable titles, in the order the
 * server gave them: newest saved first. `settled` turns true once every `tmdb:`
 * id has answered, so a caller only shows an empty state when the list really
 * is empty.
 */
export function useSavedTitles(
  ids: readonly string[],
  ready: boolean,
  movieById: ReadonlyMap<string, MovieView>,
  showById: ReadonlyMap<string, ShowView>,
): SavedTitles {
  const tmdbIds = useMemo(() => tmdbIdsIn(ids), [ids]);
  const { entries, loading } = useDiscoverEntries(tmdbIds);
  const titles = useMemo(
    () => collect(ids, movieById, showById, entries),
    [ids, movieById, showById, entries],
  );
  return { titles, settled: ready && !loading };
}
