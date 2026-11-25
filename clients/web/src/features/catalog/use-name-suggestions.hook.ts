import type { TmdbPerson, TmdbStudio } from '@kromatv/client/media';
import { collectGenres } from '@kromatv/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { useDebouncedValue } from '#web/shared/lib/use-debounced-value.hook';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const PAUSE_MS = 250;
const SHORTEST = 2;
const KEPT_MS = 5 * 60 * 1000;

const NOBODY: readonly TmdbPerson[] = [];
const NO_STUDIO: readonly TmdbStudio[] = [];

function useAsked(query: string) {
  const asked = useDebouncedValue(query.trim(), PAUSE_MS);
  return { asked, enabled: asked.length >= SHORTEST };
}

/** The people TMDB offers for `query` once the typing pauses, and whether an
 * answer is on its way. Nothing for fewer than two letters. */
export function usePeopleSearch(query: string) {
  const { client } = useAuth();
  const { asked, enabled } = useAsked(query);
  const found = useQuery({
    queryKey: ['tmdb-people', asked],
    queryFn: () => client.media.titleEdits.people(asked),
    enabled,
    staleTime: KEPT_MS,
  });
  return { people: enabled ? (found.data?.results ?? NOBODY) : NOBODY, loading: found.isFetching };
}

/** The studios TMDB offers for `query`, as `usePeopleSearch` does for people. */
export function useStudioSearch(query: string) {
  const { client } = useAuth();
  const { asked, enabled } = useAsked(query);
  const found = useQuery({
    queryKey: ['tmdb-studios', asked],
    queryFn: () => client.media.titleEdits.studios(asked),
    enabled,
    staleTime: KEPT_MS,
  });
  return {
    studios: enabled ? (found.data?.results ?? NO_STUDIO) : NO_STUDIO,
    loading: found.isFetching,
  };
}

/** Every genre the library's films and series carry, the most used first. */
export function useLibraryGenres(): readonly string[] {
  const runtime = useWebRuntime();
  const movies = useQuery(runtime.queries.catalogQueries.moviesView()).data;
  const shows = useQuery(runtime.queries.catalogQueries.showsView()).data;
  return useMemo(
    () => collectGenres([...(movies ?? []), ...(shows ?? [])]).map((genre) => genre.name),
    [movies, shows],
  );
}
