// Shared catalogue browser for the Films / Series tabs: the masthead and its
// filter strip, an exact-fit poster grid, and the A-Z rail beside it.

import type { KromaClient } from '@kroma/client';
import type { MediaItem, Show } from '@kroma/client/media';
import {
  collectGenres,
  genreLabel,
  hasGenre,
  letterMarks,
  type SortMode,
  sizedImageUrl,
  sortTitles,
  titleLetter,
} from '@kroma/core';
import { Box, Icon, styles } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { type ItemRange, lettersOnScreen } from '#mobile/lib/gridScroll';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { AlphabetRail, RAIL_RESERVE } from './AlphabetRail';
import { CatalogueHeader } from './CatalogueHeader';
import { type CardModel, movieCard, showCard } from './cards';
import { gridMetrics, PosterGrid, type PosterGridHandle } from './PosterGrid';
import { EmptyState, ErrorView, Loading } from './ui';

// Under this the grid is a couple of flicks tall and the rail is noise.
const RAIL_MIN_ITEMS = 24;

function featuredBackdrop(
  entries: readonly (MediaItem | Show)[],
  client: KromaClient,
): string | null {
  let best: { rating: number; url: string } | null = null;
  for (const entry of entries) {
    const url = client.media.artwork.backdropFor(entry);
    if (url === null) continue;
    const rating = entry.metadata?.rating ?? -1;
    if (best === null || rating > best.rating) best = { rating, url };
  }
  return best === null ? null : sizedImageUrl(best.url, 1200);
}

export function CatalogueScreen<T extends MediaItem | Show>({
  title,
  entries,
  kind,
  pending,
  error,
  refetch,
  refreshing,
}: Readonly<{
  title: string;
  entries: T[] | undefined;
  kind: 'movie' | 'show';
  pending: boolean;
  error: boolean;
  refetch(): void;
  refreshing: boolean;
}>) {
  const t = useT();
  const client = useClient();
  const { width, height } = useWindowDimensions();
  const gutters = useGutters();
  const [sort, setSort] = useState<SortMode>('added');
  const [genre, setGenre] = useState<string | null>(null);
  const [visible, setVisible] = useState<ItemRange | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const grid = useRef<PosterGridHandle>(null);
  const watched = useQuery({ ...client.query.playback.watched(), staleTime: 60_000 });
  const watchedIds = useMemo(() => new Set<string>(watched.data ?? []), [watched.data]);

  // Sorted and bucketed by the name on the card, not the scanned file's.
  const titled = useMemo(
    () => (entries ?? []).map((e) => ({ ...e, title: e.metadata?.title ?? e.title })),
    [entries],
  );
  const genres = useMemo(() => collectGenres(titled).slice(0, 14), [titled]);
  const filtered = useMemo(
    () => (genre ? titled.filter((e) => hasGenre(e, genre)) : titled),
    [titled, genre],
  );
  const view = useMemo(() => sortTitles(filtered, sort), [filtered, sort]);
  const marks = useMemo(() => (sort === 'title' ? letterMarks(view) : []), [view, sort]);
  const letters = useMemo(() => new Set(filtered.map((e) => titleLetter(e.title))), [filtered]);
  const backdrop = useMemo(() => featuredBackdrop(filtered, client), [filtered, client]);

  // A landscape phone is too short for the alphabet, and flicks a wide grid.
  const showRail = height > width && filtered.length >= RAIL_MIN_ITEMS && letters.size > 1;
  const pad = { left: gutters.left, right: gutters.right + (showRail ? RAIL_RESERVE : 0) };
  const { cardW } = gridMetrics(width, pad.left + pad.right);
  const cards: CardModel[] = useMemo(
    () =>
      view.map((entry) => ({
        ...(kind === 'show'
          ? showCard(entry as Show, client, cardW)
          : movieCard(entry as MediaItem, client, cardW)),
        watched: watchedIds.has(entry.id),
      })),
    [view, kind, client, cardW, watchedIds],
  );

  const scrollToLetter = useCallback(
    (letter: string) => {
      const mark = marks.find((m) => m.letter === letter);
      if (mark) grid.current?.scrollToItem(mark.index);
    },
    [marks],
  );
  // A jump from another sort first flips to title order, then lands once the
  // re-sorted grid has rendered.
  const jump = (letter: string) => {
    if (sort === 'title') {
      scrollToLetter(letter);
      return;
    }
    setPendingJump(letter);
    setSort('title');
  };
  useEffect(() => {
    if (pendingJump === null || sort !== 'title') return;
    scrollToLetter(pendingJump);
    setPendingJump(null);
  }, [pendingJump, sort, scrollToLetter]);

  if (pending) return <Loading label={t('common.loading')} />;
  if (error)
    return (
      <ErrorView message={t('error.serverBody')} retryLabel={t('error.retry')} onRetry={refetch} />
    );

  const active = genre === null ? undefined : genres.find((g) => g.slug === genre);
  const header = (
    <CatalogueHeader
      title={title}
      eyebrow={active ? genreLabel(t, active.name) : t('browse.library')}
      countText={t(kind === 'show' ? 'browse.count.series' : 'browse.count.movies', {
        count: view.length,
      })}
      backdrop={backdrop}
      sort={sort}
      onSort={setSort}
      genres={genres}
      genre={genre}
      onGenre={setGenre}
      insetRight={showRail ? RAIL_RESERVE : 0}
    />
  );

  return (
    <Box style={s.screen}>
      <PosterGrid
        ref={grid}
        cards={cards}
        gutters={pad}
        header={header}
        onVisibleItems={setVisible}
        empty={
          <EmptyState
            icon={<Icon name="movie" size={34} thickness={1.8} color="textMuted" />}
            title={t('search.noResults')}
          />
        }
        refreshing={refreshing}
        onRefresh={refetch}
      />
      {showRail ? (
        <AlphabetRail
          available={letters}
          range={lettersOnScreen(marks, view.length, visible)}
          onJump={jump}
        />
      ) : null}
    </Box>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
});
