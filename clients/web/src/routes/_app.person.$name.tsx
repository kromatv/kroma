import { personDisplayName, personInvolvement, posterColors, roleLabels } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, color, EmptyState, gradient, PageHeader, Row, Text } from '@kroma/ui/kit';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type CatalogEntry, CatalogGrid } from '#web/features/catalog/cards';
import { initials } from '#web/features/catalog/detail';
import { PersonProfile } from '#web/features/catalog/person-profile';
import { imageUrl, isAuthed, kromaClient, toMovieView, toShowView } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { Image, PAGE_MAIN, PageSkeleton } from '#web/shared/ui';

/** `/person/<name>` every movie + show one cast/crew member is credited in. */
export const Route = createFileRoute('/_app/person/$name')({
  loader: async ({ params, context: { queryClient } }) => {
    if (!isAuthed()) throw redirect({ to: '/' });
    // Prefetched, not awaited: a provider round trip must not hold the page back
    // once the credits are in.
    void queryClient.prefetchQuery(catalogQueries.personDetails(params.name));
    await queryClient.ensureQueryData(catalogQueries.personCredits(params.name));
  },
  pendingComponent: () => <PageSkeleton rails={0} />,
  component: PersonPage,
});

function PersonPage() {
  const t = useT();
  const { name: rawName } = Route.useParams();
  const { data } = useSuspenseQuery(catalogQueries.personCredits(rawName));
  const { data: profile } = useQuery(catalogQueries.personDetails(rawName));
  const detail = profile?.person ?? null;
  const c = kromaClient();
  const results = data.results;
  const entries: CatalogEntry[] = results.map((hit) =>
    hit.type === 'show'
      ? { kind: 'show', show: toShowView(c, hit.show) }
      : { kind: 'movie', movie: toMovieView(c, hit.item) },
  );
  // The credits alone carry roles and a usable photo; the provider profile only
  // ever improves on them.
  const metas = results.map((hit) => (hit.type === 'show' ? hit.show.metadata : hit.item.metadata));
  const name = detail?.name ?? personDisplayName(metas, rawName);
  const involvement = personInvolvement(metas, rawName);
  const photo = imageUrl(detail?.profileUrl ?? involvement.profileUrl);
  const [g1, g2] = posterColors(name);
  const roles = roleLabels(t, involvement);

  return (
    <main className={PAGE_MAIN}>
      <header>
        <Row gap={22} mb={36}>
          <Box
            w={{ base: 80, md: 104 }}
            h={{ base: 80, md: 104 }}
            radius="circle"
            overflow="hidden"
            shadow="card"
          >
            <Image
              src={photo}
              alt={name}
              fill
              placeholder={<PersonInitials name={name} g1={g1} g2={g2} />}
              fallback={<PersonInitials name={name} g1={g1} g2={g2} />}
            />
          </Box>
          <Box minW={0}>
            <PageHeader.Title>{name}</PageHeader.Title>
            <Box row wrap align="center" gap={8} mt={6}>
              {roles.length ? (
                <>
                  <Text variant="meta" color="accent">
                    {roles.join(' · ')}
                  </Text>
                  <Text variant="meta" color="textDim">
                    ·
                  </Text>
                </>
              ) : null}
              <Text variant="meta" color="textMuted">
                {t('person.titleCount', { count: entries.length })}
              </Text>
            </Box>
          </Box>
        </Row>
      </header>
      <PersonProfile detail={detail} />
      {entries.length ? (
        <CatalogGrid entries={entries} />
      ) : (
        <EmptyState.Root icon="user-x">
          <EmptyState.Title>{t('person.empty')}</EmptyState.Title>
        </EmptyState.Root>
      )}
    </main>
  );
}

function PersonInitials({ name, g1, g2 }: Readonly<{ name: string; g1: string; g2: string }>) {
  return (
    <Box fill center style={gradient(`linear-gradient(158deg, ${g1}, ${g2})`)}>
      <Box
        fill
        style={gradient(
          `radial-gradient(70% 60% at 50% 22%, ${color('white/20')}, transparent 60%)`,
        )}
      />
      <Text variant="heading" color="white/90">
        {initials(name)}
      </Text>
    </Box>
  );
}
