// A my-list id can name a movie OR a show, so the ids are resolved against both
// catalogues, in the order the server returned them (newest first).

import { ItemId, type MediaItem, type Show, ShowId } from '@kroma/core';
import { Box, Icon, styles, Txt } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type CardModel, movieCard, showCard } from '#mobile/components/cards';
import { gridMetrics, PosterGrid } from '#mobile/components/PosterGrid';
import { EmptyState, ErrorView, Loading } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

export default function MyList() {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  const { cardW } = gridMetrics(width, gutters.left + gutters.right);

  const ids = useQuery({ queryKey: ['myList'], queryFn: () => client.myList() });
  // Same keys as the Films / Series tabs: one cache, three readers.
  const movies = useQuery({ queryKey: ['movies'], queryFn: () => client.movies() });
  const shows = useQuery({ queryKey: ['shows'], queryFn: () => client.shows() });

  const cards: CardModel[] = useMemo(() => {
    const movieById = new Map<string, MediaItem>((movies.data ?? []).map((m) => [m.id, m]));
    const showById = new Map<string, Show>((shows.data ?? []).map((s) => [s.id, s]));
    const out: CardModel[] = [];
    for (const id of ids.data ?? []) {
      const movie = movieById.get(ItemId.of(id));
      if (movie) {
        out.push(movieCard(movie, client, cardW));
        continue;
      }
      const show = showById.get(ShowId.of(id));
      if (show) out.push(showCard(show, client, cardW));
    }
    return out;
  }, [ids.data, movies.data, shows.data, client, cardW]);

  const pending = ids.isPending || movies.isPending || shows.isPending;
  const error = ids.isError || movies.isError || shows.isError;
  if (pending) return <Loading label={t('common.loading')} />;
  if (error)
    return (
      <ErrorView
        message={t('error.serverBody')}
        retryLabel={t('error.retry')}
        onRetry={() => void ids.refetch()}
      />
    );

  const header = (
    <Box style={{ paddingTop: insets.top + spacing.sm }}>
      <Box style={s.titleRow}>
        <Txt style={s.title}>{t('nav.myList')}</Txt>
        <Txt style={s.count}>{cards.length}</Txt>
      </Box>
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
            icon={<Icon name="bookmark" size={34} stroke={1.8} color="textMuted" />}
            title={t('nav.myList')}
            hint={t('content.myListEmpty')}
          />
        }
        refreshing={ids.isRefetching}
        onRefresh={() => void ids.refetch()}
      />
    </Box>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  titleRow: { row: true, align: 'baseline', gap: 10, mb: spacing.sm },
  title: { ...type.display, fontSize: 30 },
  count: { ...type.caption },
});
