import type { MediaItem, Show, SubjectId } from '@kromatv/client/media';
import { collectGenres, hasGenre, type SortMode, sortTitles } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Text, useFocusNav } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav, useParams } from '#tv/app/router';
import {
  AmbientBackdrop,
  type CatalogEntry as Entry,
} from '#tv/features/catalog/home/AmbientBackdrop';
import { entryCard } from '#tv/features/catalog/home/entry-card';
import { HintBar } from '#tv/features/catalog/home/HintBar';
import { type GridCard, PosterGrid } from '#tv/features/catalog/home/PosterGrid';
import { EMPTY } from '#tv/features/catalog/screenStyle';
import { useTitleMenu } from '#tv/features/catalog/TitleMenu';
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
  myList: { has: (id: SubjectId) => boolean },
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
  const titleMenu = useTitleMenu(nav.back);
  const hold = titleMenu.open;
  useFocusNav({ onBack: titleMenu.onBack, resetKey: kind });

  const [sort, setSort] = useState<SortMode>('added');
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [prevKind, setPrevKind] = useState(kind);
  if (prevKind !== kind) {
    setPrevKind(kind);
    setGenre(undefined);
    setFocusId(null);
  }

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
        ...entryCard(e, { client, nav, openMenu: hold, focus: setFocusId }),
        overline: t(e.kind === 'show' ? 'content.series' : 'content.film'),
        watched: watched.has(e.item.id),
      })),
    [entries, client, nav, watched, hold, t],
  );

  const focused = useMemo<Entry | null>(
    () => entries.find((e) => e.item.id === focusId) ?? entries[0] ?? null,
    [entries, focusId],
  );
  const hasItems = baseMovies.length + baseShows.length > 0;
  const empty = kind === 'mylist' && cards.length === 0;

  return (
    <Box fill bg="bg" overflow="hidden" isolate>
      <AmbientBackdrop entry={focused} />

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
        <Box flex center px={64} gap={12}>
          <Text style={EMPTY} color="textDim">
            {t('content.myListEmpty')}
          </Text>
          <Text style={EMPTY} color="textMuted">
            {t('content.myListEmptyHint')}
          </Text>
        </Box>
      ) : (
        <PosterGrid cards={cards} />
      )}

      <HintBar browseKey="content.hintBrowseAll" strength={0.85} />
      {titleMenu.menu}
    </Box>
  );
}
