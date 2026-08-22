import {
  collectGenres,
  hasGenre,
  type MediaItem,
  type MessageKey,
  posterColors,
  type Show,
  type SortMode,
  sortTitles,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Text, useFocusNav } from '@kroma/ui/kit';
import { useEffect, useMemo, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav, useParams } from '#tv/app/router';
import {
  AMBIENT_FALLBACK,
  AmbientBackdrop,
  type CatalogEntry as Entry,
  entryBackdrop,
  entryPoster,
} from '#tv/features/catalog/home/AmbientBackdrop';
import { HintBar } from '#tv/features/catalog/home/HintBar';
import { type GridCard, PosterGrid } from '#tv/features/catalog/home/PosterGrid';
import { EMPTY } from '#tv/features/catalog/screenStyle';
import { BrowseFilters, BrowseHeader } from '#tv/features/catalog/TvBrowseHeader';

const LABEL_KEY: Record<'films' | 'series' | 'mylist', MessageKey> = {
  films: 'nav.films',
  series: 'nav.series',
  mylist: 'nav.myList',
};

function sectionList<T extends MediaItem | Show>(
  items: T[],
  own: boolean,
  other: boolean,
  myList: { has: (id: string) => boolean },
): T[] {
  if (own) return items;
  if (other) return [];
  return items.filter((it) => myList.has(it.id));
}

/** Full-screen catalogue browse for one section (Films / Séries / Ma liste). */
export function TvGrid() {
  const { kind } = useParams('grid');
  const { movies, shows } = useConnection();
  const client = useClient();
  const t = useT();
  const nav = useNav();
  const myList = useMyList();
  const watched = useWatched();
  const isFilms = kind === 'films';
  const isSeries = kind === 'series';
  useFocusNav({ onBack: nav.back, resetKey: kind });

  const [sort, setSort] = useState<SortMode>('added');
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const [focusId, setFocusId] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: kind is an intentional re-run key (resets the filter on a section switch), not read inside the effect
  useEffect(() => {
    setGenre(undefined);
    setFocusId(null);
  }, [kind]);

  const baseMovies = useMemo(
    () => sectionList(movies, isFilms, isSeries, myList),
    [isFilms, isSeries, movies, myList],
  );
  const baseShows = useMemo(
    () => sectionList(shows, isSeries, isFilms, myList),
    [isFilms, isSeries, shows, myList],
  );

  const genres = useMemo(
    () => collectGenres([...baseMovies, ...baseShows]),
    [baseMovies, baseShows],
  );

  const entries = useMemo<Entry[]>(() => {
    const keep = (it: MediaItem | Show) => !genre || hasGenre(it, genre);
    return [
      ...sortTitles(baseMovies.filter(keep), sort).map((m): Entry => ({ kind: 'movie', item: m })),
      ...sortTitles(baseShows.filter(keep), sort).map((s): Entry => ({ kind: 'show', item: s })),
    ];
  }, [baseMovies, baseShows, genre, sort]);

  const cards = useMemo<GridCard[]>(
    () =>
      entries.map((e) => ({
        id: e.item.id,
        title: e.item.title,
        overline: t(e.kind === 'show' ? 'content.series' : 'content.film'),
        poster: (width: number) => entryPoster(client, e, width),
        colors: posterColors(e.item.id),
        watched: watched.has(e.item.id),
        progress: e.kind === 'show' ? (e.item.progress ?? null) : null,
        onClick: () =>
          e.kind === 'movie' ? nav.go('movie', { item: e.item }) : nav.go('show', { show: e.item }),
        onFocus: () => setFocusId(e.item.id),
      })),
    [entries, client, nav, watched, t],
  );

  const focused = useMemo<Entry | null>(
    () => entries.find((e) => e.item.id === focusId) ?? entries[0] ?? null,
    [entries, focusId],
  );
  const hasItems = baseMovies.length + baseShows.length > 0;
  const empty = kind === 'mylist' && cards.length === 0;

  return (
    <Box fill bg="bg" overflow="hidden" isolate>
      <AmbientBackdrop
        src={entryBackdrop(client, focused)}
        colors={focused ? posterColors(focused.item.id) : AMBIENT_FALLBACK}
      />

      <BrowseHeader
        label={t(LABEL_KEY[kind])}
        count={cards.length}
        hasItems={hasItems}
        focused={focused}
      />

      {hasItems ? (
        <BrowseFilters
          sort={sort}
          onSort={setSort}
          genres={genres}
          genre={genre}
          onGenre={setGenre}
        />
      ) : null}

      {empty ? (
        <Box flex center px={64}>
          <Text style={EMPTY} color="textDim">
            {t('content.myListEmpty')}
          </Text>
        </Box>
      ) : (
        <PosterGrid cards={cards} />
      )}

      <HintBar browseKey="content.hintBrowseAll" strength={0.85} />
    </Box>
  );
}
