// One genre: every movie and show carrying it, in a poster grid with the
// genre's hue as the header accent.

import { hasGenre, type MediaItem, type Show, sortTitles } from '@kroma/core';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { type CardModel, movieCard, showCard } from '#mobile/components/cards';
import { PageHeader } from '#mobile/components/PageHeader';
import { PosterGrid } from '#mobile/components/PosterGrid';
import { FilmTabIcon } from '#mobile/components/tabIcons';
import { EmptyState, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { colors, posterWidth } from '#mobile/lib/theme';

function isShow(entry: MediaItem | Show): entry is Show {
  return 'seasonCount' in entry;
}

export default function GenrePage() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const genre = decodeURIComponent(name);
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);

  const catalogue = useQuery({
    queryKey: ['genreCatalogue'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<(MediaItem | Show)[]> => {
      const [movies, shows] = await Promise.all([client.movies(), client.shows()]);
      return [...movies, ...shows];
    },
  });

  if (catalogue.isPending) return <Loading label={t('common.loading')} />;

  const matches = sortTitles(
    (catalogue.data ?? []).filter((entry) => hasGenre(entry, genre)),
    'rating',
  );
  const cards: CardModel[] = matches.map((entry) =>
    isShow(entry) ? showCard(entry, client, cardW) : movieCard(entry, client, cardW),
  );

  return (
    <Screen padded={false}>
      <PageHeader title={genre} />
      <PosterGrid
        cards={cards}
        empty={
          <EmptyState
            icon={<FilmTabIcon color={colors.textDim} size={34} />}
            title={t('search.noResults')}
          />
        }
      />
    </Screen>
  );
}
