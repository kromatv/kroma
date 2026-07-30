// One person: who they are, then every movie and show they are credited in.

import { personInvolvement, roleLabels } from '@kroma/core';
import { Icon } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { type CardModel, movieCard, showCard } from '#mobile/components/cards';
import { PageHeader } from '#mobile/components/PageHeader';
import { PersonProfile } from '#mobile/components/PersonProfile';
import { gridMetrics, PosterGrid } from '#mobile/components/PosterGrid';
import { EmptyState, Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { colors } from '#mobile/lib/theme';

const PORTRAIT_W = 280;

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
  // A separate query on purpose: the biography is a provider lookup and must
  // never hold up the filmography, which the library already knows.
  const profile = useQuery({
    queryKey: ['person-details', person],
    queryFn: () => client.personDetails(person),
    staleTime: 60 * 60_000,
  });

  if (credits.isPending)
    return (
      <Screen padded={false}>
        <PageHeader title={person} />
        <Loading label={t('common.loading')} />
      </Screen>
    );

  const results = credits.data?.results ?? [];
  const cards: CardModel[] = results.map((hit) =>
    hit.type === 'show' ? showCard(hit.show, client, cardW) : movieCard(hit.item, client, cardW),
  );

  // Roles come from the library's own credits (what this person did in THIS
  // catalogue); the portrait prefers the provider's, which is the larger source.
  const metas = results.map((hit) => (hit.type === 'show' ? hit.show.metadata : hit.item.metadata));
  const involvement = personInvolvement(metas, person);
  const detail = profile.data?.person ?? null;
  const photo = client.resolveArt(detail?.profileUrl ?? involvement.profileUrl, PORTRAIT_W);

  return (
    <Screen padded={false}>
      <PageHeader title={detail?.name ?? person} />
      <PosterGrid
        cards={cards}
        header={
          <PersonProfile
            detail={detail}
            photo={photo}
            name={detail?.name ?? person}
            roles={roleLabels(t, involvement)}
          />
        }
        empty={
          <EmptyState
            icon={<Icon name="user-circle" size={34} stroke={1.8} color={colors.textDim} />}
            title={t('search.noResults')}
          />
        }
      />
    </Screen>
  );
}
