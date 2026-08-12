// Shared catalogue browser for the Films / Series tabs: large header with the
// title count, sort selector, genre filter chips, and an exact-fit poster grid.

import {
  collectGenres,
  hasGenre,
  type MediaItem,
  type Show,
  SORT_MODES,
  type SortMode,
  sortTitles,
} from '@kroma/core';
import { Box, Chip, Icon, styles, Text } from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';
import { type CardModel, movieCard, showCard } from './cards';
import { gridMetrics, PosterGrid } from './PosterGrid';
import { EmptyState, ErrorView, Loading } from './ui';

const SORT_KEYS = {
  added: 'browse.sort.added',
  release: 'browse.sort.release',
  title: 'browse.sort.title',
  rating: 'browse.sort.rating',
} as const;

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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  const { cardW } = gridMetrics(width, gutters.left + gutters.right);
  const [sort, setSort] = useState<SortMode>('added');
  const [genre, setGenre] = useState<string | null>(null);

  const genres = useMemo(() => collectGenres(entries ?? []).slice(0, 14), [entries]);

  const cards: CardModel[] = useMemo(() => {
    const filtered = genre ? (entries ?? []).filter((e) => hasGenre(e, genre)) : (entries ?? []);
    const sorted = sortTitles(filtered, sort);
    return sorted.map((entry) =>
      kind === 'show'
        ? showCard(entry as Show, client, cardW)
        : movieCard(entry as MediaItem, client, cardW),
    );
  }, [entries, genre, sort, kind, client, cardW]);

  if (pending) return <Loading label={t('common.loading')} />;
  if (error)
    return (
      <ErrorView message={t('error.serverBody')} retryLabel={t('error.retry')} onRetry={refetch} />
    );

  const header = (
    <Box style={{ paddingTop: insets.top + spacing.sm }}>
      <Box style={s.titleRow}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.count}>{cards.length}</Text>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.chipRow, gutters.style]}
        style={[s.chipStrip, { marginLeft: -gutters.left, marginRight: -gutters.right }]}
      >
        {SORT_MODES.map((mode) => (
          <Chip
            key={mode}
            label={t(SORT_KEYS[mode])}
            active={sort === mode}
            onPress={() => setSort(mode)}
          />
        ))}
      </ScrollView>
      {genres.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.chipRow, gutters.style]}
          style={[s.chipStrip, { marginLeft: -gutters.left, marginRight: -gutters.right }]}
        >
          <Chip
            label={t('browse.allGenres')}
            active={genre === null}
            onPress={() => setGenre(null)}
          />
          {genres.map((g) => (
            <Chip
              key={g.name}
              label={g.name}
              active={genre === g.name}
              onPress={() => setGenre(genre === g.name ? null : g.name)}
            />
          ))}
        </ScrollView>
      ) : null}
      <Box style={{ height: spacing.sm }} />
    </Box>
  );

  return (
    <Box style={s.screen}>
      <PosterGrid
        cards={cards}
        gutters={gutters}
        header={header}
        empty={
          <EmptyState
            icon={<Icon name="movie" size={34} thickness={1.8} color="textMuted" />}
            title={t('search.noResults')}
          />
        }
        refreshing={refreshing}
        onRefresh={refetch}
      />
    </Box>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  titleRow: { row: true, align: 'baseline', gap: 10, mb: spacing.sm },
  title: { ...type.display, fontSize: 30 },
  count: { ...type.caption },
  // Bleed the strips back out over the grid's gutters; the inline margins /
  // paddings mirror the live gutter widths.
  chipStrip: { mb: spacing.sm },
  chipRow: { gap: 8 },
});
