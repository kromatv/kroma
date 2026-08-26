// One genre: every movie and show carrying it, in a poster grid with the
// genre's hue as the header accent.

import {
  genreLabel,
  genreOfSegment,
  hasGenre,
  type MediaItem,
  type Show,
  sortTitles,
} from '@kroma/core';
import { Icon } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { type CardModel, movieCard, showCard } from '#mobile/components/cards';
import { PageHeader } from '#mobile/components/PageHeader';
import { PosterGrid } from '#mobile/components/PosterGrid';
import { EmptyState, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { routeParam } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { posterWidth } from '#mobile/lib/theme';

function isShow(entry: MediaItem | Show): entry is Show {
  return 'seasonCount' in entry;
}

export default function GenreRoute() {
  const name = routeParam(useLocalSearchParams<{ name?: string }>().name);
  return name ? <GenrePage name={name} /> : <Redirect href="/" />;
}

function GenrePage({ name }: Readonly<{ name: string }>) {
  const genre = genreOfSegment(decodeURIComponent(name));
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
      <PageHeader title={genreLabel(t, genre)} />
      <PosterGrid
        cards={cards}
        empty={
          <EmptyState
            icon={<Icon name="movie" size={34} thickness={1.8} color="textMuted" />}
            title={t('search.noResults')}
          />
        }
      />
    </Screen>
  );
}
