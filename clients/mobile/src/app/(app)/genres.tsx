// Genres: the library's own genres as artwork tiles, most common first, on the
// same tile the web and the television draw.

import type { MediaItem, Show } from '@kroma/client/media';
import {
  collectGenres,
  genreColors,
  genreLabel,
  genreSegment,
  genreShowcases,
  genreTint,
} from '@kroma/core';
import {
  CategoryTile,
  cellWidth,
  columnsFor,
  Grid,
  genreIcon,
  Icon,
  styles,
  tintGradient,
} from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { EmptyState, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { spacing } from '#mobile/lib/theme';

const GAP = 12;
// The web's cell: a share of the window, held between a phone's pair of
// columns and a desktop's cap.
const CELL_SHARE = 0.22;
const CELL_MIN = 160;
const CELL_MAX = 304;

export default function Genres() {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const gutters = useGutters();

  const catalogue = useQuery({
    queryKey: ['genreCatalogue'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<(MediaItem | Show)[]> => {
      const [movies, shows] = await Promise.all([client.media.movies(), client.media.shows()]);
      return [...movies, ...shows];
    },
  });

  const items = catalogue.data;
  const genres = useMemo(() => collectGenres(items ?? []), [items]);
  const showcases = useMemo(() => genreShowcases(items ?? []), [items]);
  const room = width - gutters.left - gutters.right;
  const min = Math.round(Math.min(Math.max(width * CELL_SHARE, CELL_MIN), CELL_MAX));
  const cellW = cellWidth(room, columnsFor(room, min, GAP), GAP);

  if (catalogue.isPending) return <Loading label={t('common.loading')} />;

  return (
    <Screen padded={false}>
      <PageHeader title={t('nav.genres')} />
      {genres.length === 0 ? (
        <EmptyState
          icon={<Icon name="category" size={34} thickness={1.8} color="textMuted" />}
          title={t('genres.empty')}
        />
      ) : (
        <ScrollView contentContainerStyle={[s.content, gutters.style]}>
          <Grid min={min} gap={GAP} width={room}>
            {genres.map((g) => {
              const pick = showcases.get(g.slug);
              return (
                <CategoryTile
                  key={g.slug}
                  size="md"
                  aspect={3 / 2}
                  label={genreLabel(t, g.name)}
                  icon={genreIcon(g.slug)}
                  meta={t('person.titleCount', { count: g.count })}
                  art={pick ? client.media.artwork.backdropFor(pick, cellW) : null}
                  background={tintGradient(genreColors(g.slug))}
                  wash={genreTint(g.slug)}
                  onPress={() => router.push(`/genre/${genreSegment(g.slug)}` as never)}
                />
              );
            })}
          </Grid>
        </ScrollView>
      )}
    </Screen>
  );
}

const s = styles({
  content: { pt: spacing.sm, pb: spacing.xl },
});
