// One person: every movie and show they are credited in, as a poster grid.

import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { type CardModel, movieCard, showCard } from '#mobile/components/cards';
import { PageHeader } from '#mobile/components/PageHeader';
import { gridMetrics, PosterGrid } from '#mobile/components/PosterGrid';
import { ProfileTabIcon } from '#mobile/components/tabIcons';
import { EmptyState, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { colors } from '#mobile/lib/theme';

export default function PersonPage() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const person = decodeURIComponent(name);
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const { cardW } = gridMetrics(width);

  const credits = useQuery({
    queryKey: ['person', person],
    queryFn: () => client.personCredits(person),
    staleTime: 10 * 60_000,
  });

  if (credits.isPending)
    return (
      <Screen padded={false}>
        <PageHeader title={person} />
        <Loading label={t('common.loading')} />
      </Screen>
    );

  const cards: CardModel[] = (credits.data?.results ?? []).map((hit) =>
    hit.type === 'show' ? showCard(hit.show, client, cardW) : movieCard(hit.item, client, cardW),
  );

  return (
    <Screen padded={false}>
      <PageHeader title={person} />
      <PosterGrid
        cards={cards}
        empty={
          <EmptyState
            icon={<ProfileTabIcon color={colors.textDim} size={34} />}
            title={t('search.noResults')}
          />
        }
      />
    </Screen>
  );
}
