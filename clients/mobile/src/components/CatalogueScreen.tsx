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
import { Chip, Icon } from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { colors, spacing, type } from '#mobile/lib/theme';
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
    <View style={{ paddingTop: insets.top + spacing.sm }}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{cards.length}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipRow, gutters.style]}
        style={[styles.chipStrip, { marginLeft: -gutters.left, marginRight: -gutters.right }]}
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
          contentContainerStyle={[styles.chipRow, gutters.style]}
          style={[styles.chipStrip, { marginLeft: -gutters.left, marginRight: -gutters.right }]}
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
      <View style={{ height: spacing.sm }} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <PosterGrid
        cards={cards}
        gutters={gutters}
        header={header}
        empty={
          <EmptyState
            icon={<Icon name="movie" size={34} stroke={1.8} color={colors.textDim} />}
            title={t('search.noResults')}
          />
        }
        refreshing={refreshing}
        onRefresh={refetch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: spacing.sm },
  title: { ...type.display, fontSize: 30 },
  count: { ...type.caption },
  // Bleed the strips back out over the grid's gutters; the inline margins /
  // paddings mirror the live gutter widths.
  chipStrip: { marginBottom: spacing.sm },
  chipRow: { gap: 8 },
});
