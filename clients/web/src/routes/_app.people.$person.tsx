import { personInvolvement, posterColors, roleLabels, type TmdbCredit } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  color,
  EmptyState,
  Focusable,
  gradient,
  PageHeader,
  Row,
  styles,
  Text,
} from '@kroma/ui/kit';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type CatalogEntry, CatalogGrid } from '#web/features/catalog/cards';
import { initials } from '#web/features/catalog/detail';
import { PersonProfile } from '#web/features/catalog/person-profile';
import { imageUrl, isAuthed, kromaClient, toMovieView, toShowView } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { Image, PageFrame, PageSkeleton } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

export const Route = createFileRoute('/_app/people/$person')({
  loader: async ({ params, context: { queryClient } }) => {
    if (!isAuthed()) throw redirect({ to: '/' });
    void queryClient.prefetchQuery(catalogQueries.personDetails(params.person));
    await queryClient.ensureQueryData(catalogQueries.personCredits(params.person));
  },
  pendingComponent: () => <PageSkeleton rails={0} />,
  component: PersonPage,
});

function PersonPage() {
  const t = useT();
  const { person } = Route.useParams();
  const { data } = useSuspenseQuery(catalogQueries.personCredits(person));
  const { data: profile } = useQuery(catalogQueries.personDetails(person));
  const detail = profile?.person ?? null;
  const tmdbCredits = profile?.credits ?? [];
  const c = kromaClient();
  const { name: creditedName, results } = data;
  const entries: CatalogEntry[] = results.map((hit) =>
    hit.type === 'show'
      ? { kind: 'show', show: toShowView(c, hit.show) }
      : { kind: 'movie', movie: toMovieView(c, hit.item) },
  );
  const metas = results.map((hit) => (hit.type === 'show' ? hit.show.metadata : hit.item.metadata));
  // A segment that is only a provider id is not a name: reached from a discover
  // title's cast, nothing local carries the credit, so with no provider answer
  // there is no name to show and printing the id would be worse than saying so.
  const credited = /^\d+$/.test(creditedName) ? null : creditedName;
  const name = detail?.name ?? credited ?? t('person.unnamed');
  const involvement = personInvolvement(metas, creditedName);
  const photo = imageUrl(detail?.profileUrl ?? involvement.profileUrl);
  const [g1, g2] = posterColors(name);
  const roles = roleLabels(t, involvement);

  const body = renderPersonBody(t, entries, tmdbCredits);

  return (
    <PageFrame>
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
      {body}
    </PageFrame>
  );
}

function renderPersonBody(
  t: ReturnType<typeof useT>,
  entries: CatalogEntry[],
  tmdbCredits: readonly TmdbCredit[],
) {
  if (entries.length) return <CatalogGrid entries={entries} />;
  if (tmdbCredits.length) return <TmdbFilmography credits={tmdbCredits} />;
  return (
    <EmptyState.Root icon="user-x">
      <EmptyState.Title>{t('person.empty')}</EmptyState.Title>
    </EmptyState.Root>
  );
}

const s = styles({ credit: { gap: 8 } });

function TmdbFilmography({ credits }: Readonly<{ credits: readonly TmdbCredit[] }>) {
  const t = useT();
  return (
    <section>
      <Box mb={20}>
        <Text variant="h2" mb={4}>
          {t('person.filmography')}
        </Text>
        <Text variant="meta" color="textMuted">
          {t('person.filmographyHint')}
        </Text>
      </Box>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 20,
        }}
      >
        {credits.map((credit) => (
          <Focusable
            key={`${credit.mediaType}-${credit.tmdbId}`}
            style={s.credit}
            label={credit.title}
            as={
              <RouteLink
                to="/discover/$type/$tmdbId"
                params={{
                  type: credit.mediaType === 'tv' ? 'tv' : 'movie',
                  tmdbId: String(credit.tmdbId),
                }}
              />
            }
          >
            <Box aspect={2 / 3} radius="md" overflow="hidden" shadow="card">
              <Image src={credit.posterUrl ?? null} alt={credit.title} fit="cover" fill />
            </Box>
            <Text variant="label" lines={2}>
              {credit.title}
            </Text>
            <Box row align="center" gap={6}>
              {credit.year ? (
                <Text variant="meta" color="textDim">
                  {credit.year}
                </Text>
              ) : null}
              {credit.character ? (
                <Text variant="meta" color="textMuted" lines={1}>
                  · {credit.character}
                </Text>
              ) : null}
            </Box>
          </Focusable>
        ))}
      </div>
    </section>
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
