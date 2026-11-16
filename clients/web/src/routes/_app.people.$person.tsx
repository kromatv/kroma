import type { TmdbCredit } from '@kromatv/client/media';
import { personInvolvement, posterColors, roleLabels, sizedImageUrl } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Box,
  classes,
  color,
  EmptyState,
  Focusable,
  PageHeader,
  Row,
  styles,
  Text,
  useStyleScope,
  useStyles,
  useThemeVersion,
} from '@kromatv/ui/kit';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type CatalogEntry, CatalogGrid } from '#web/features/catalog/cards.component';
import { initials } from '#web/features/catalog/detail.component';
import { PersonProfile } from '#web/features/catalog/person-profile.component';
import { imageUrl, isAuthed, toMovieView, toShowView } from '#web/shared/lib/api';
import { wash } from '#web/shared/lib/art-styles';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

import { Image, PageFrame, PageSkeleton } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link.component';

const PORTRAIT_W = 104;

export const Route = createFileRoute('/_app/people/$person')({
  loader: async ({ params, context: { runtime: webRuntime, queryClient } }) => {
    if (!isAuthed()) {
      throw redirect({ to: '/' });
    }
    void queryClient.prefetchQuery(webRuntime.queries.catalogQueries.personDetails(params.person));
    await queryClient.ensureQueryData(
      webRuntime.queries.catalogQueries.personCredits(params.person),
    );
  },
  pendingComponent: () => <PageSkeleton rails={0} />,
  component: PersonPage,
});

function PersonPage() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { person } = Route.useParams();
  const { data } = useSuspenseQuery(webRuntime.queries.catalogQueries.personCredits(person));
  const { data: profile } = useQuery(webRuntime.queries.catalogQueries.personDetails(person));
  const detail = profile?.person ?? null;
  const tmdbCredits = profile?.credits ?? [];
  const c = webRuntime.client;
  const { name: creditedName, results } = data;
  const entries: CatalogEntry[] = results.map((hit) =>
    hit.type === 'show'
      ? { kind: 'show', show: toShowView(c, hit.show) }
      : { kind: 'movie', movie: toMovieView(c, hit.item) },
  );
  const held = results.map((hit) => ({
    type: hit.type,
    metadata: hit.type === 'show' ? hit.show.metadata : hit.item.metadata,
  }));
  const metas = held.map(({ metadata }) => metadata);
  // A segment that is only a provider id is not a name: reached from a discover
  // title's cast, nothing local carries the credit, so with no provider answer
  // there is no name to show and printing the id would be worse than saying so.
  const credited = /^\d+$/.test(creditedName) ? null : creditedName;
  const name = detail?.name ?? credited ?? t('person.unnamed');
  const involvement = personInvolvement(metas, creditedName);
  const photo = sizedImageUrl(imageUrl(detail?.profileUrl ?? involvement.profileUrl), PORTRAIT_W);
  const [g1, g2] = posterColors(name);
  const roles = roleLabels(t, involvement);

  const body = renderPersonBody(t, entries, creditsOutsideLibrary(tmdbCredits, held));

  return (
    <PageFrame>
      <header>
        <Row gap={22} mb={36}>
          <Box
            w={{ base: 80, md: PORTRAIT_W }}
            h={{ base: 80, md: PORTRAIT_W }}
            radius="circle"
            overflow="hidden"
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

type TitleMetadata = { tmdbId: number } | null | undefined;

const creditKey = (kind: TmdbCredit['mediaType'], tmdbId: number) => `${kind}:${tmdbId}`;

function creditsOutsideLibrary(
  credits: readonly TmdbCredit[],
  held: readonly { type: 'movie' | 'show' | 'episode'; metadata: TitleMetadata }[],
): TmdbCredit[] {
  const inLibrary = new Set(
    held.flatMap(({ type, metadata }) =>
      metadata ? [creditKey(type === 'show' ? 'tv' : 'movie', metadata.tmdbId)] : [],
    ),
  );
  return credits.filter((credit) => !inLibrary.has(creditKey(credit.mediaType, credit.tmdbId)));
}

function renderLibrary(entries: CatalogEntry[], heading: string | null) {
  return (
    <section>
      {heading ? (
        <Text variant="h2" mb={20}>
          {heading}
        </Text>
      ) : null}
      <CatalogGrid entries={entries} />
    </section>
  );
}

function renderPersonBody(
  t: ReturnType<typeof useT>,
  entries: CatalogEntry[],
  elsewhere: readonly TmdbCredit[],
) {
  if (entries.length === 0 && elsewhere.length === 0) {
    return (
      <EmptyState.Root icon="user-x">
        <EmptyState.Title>{t('person.empty')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  const heading = elsewhere.length > 0 ? t('discover.sectionLibrary') : null;
  return (
    <>
      {entries.length > 0 ? renderLibrary(entries, heading) : null}
      {elsewhere.length > 0 ? (
        <Box mt={entries.length > 0 ? 48 : 0}>
          <TmdbFilmography credits={elsewhere} />
        </Box>
      ) : null}
    </>
  );
}

const sDefinition = styles({
  credit: { gap: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 20 },
  sheen: {
    backgroundImage: `radial-gradient(70% 60% at 50% 22%, ${color('white/20')}, transparent 60%)`,
  },
});

function TmdbFilmography({ credits }: Readonly<{ credits: readonly TmdbCredit[] }>) {
  const s = useStyles(sDefinition);

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
      <div className={classes(s.grid)}>
        {credits.map((credit) => (
          <Focusable
            key={`${credit.mediaType}-${credit.tmdbId}`}
            style={s.credit}
            label={credit.title}
            asChild
          >
            <RouteLink
              to="/discover/$type/$tmdbId"
              params={{
                type: credit.mediaType === 'tv' ? 'tv' : 'movie',
                tmdbId: String(credit.tmdbId),
              }}
            >
              <Box aspect={2 / 3} radius="md" overflow="hidden">
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
            </RouteLink>
          </Focusable>
        ))}
      </div>
    </section>
  );
}

function PersonInitials({ name, g1, g2 }: Readonly<{ name: string; g1: string; g2: string }>) {
  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  return (
    <Box fill center style={wash(g1, g2, undefined, scope)}>
      <Box fill style={s.sheen} />
      <Text variant="heading" color="white/90">
        {initials(name)}
      </Text>
    </Box>
  );
}
