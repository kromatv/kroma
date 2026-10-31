import { useT } from '@kromatv/ui';
import { EmptyState } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Hero, ShowRail } from '#web/features/catalog/cards';
import { ContinueRow } from '#web/features/catalog/continue-row';
import { HomeSections } from '#web/features/catalog/home-sections';
import { isAuthed } from '#web/shared/lib/api';
import type { HeroEntry } from '#web/shared/lib/queries';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { PageFrame, PageSkeleton, RailSkeleton } from '#web/shared/ui';

export const Route = createFileRoute('/_app/')({
  loader: async ({ context: { runtime: webRuntime, queryClient } }) => {
    // The catalogue is auth-gated: skip until signed in (the gate covers the UI;
    // the root invalidates queries on login so these prefetch then).
    if (!isAuthed()) return;
    const { catalogQueries, userQueries } = webRuntime.queries;
    void queryClient.prefetchQuery(userQueries.continueWatching());
    void queryClient.prefetchQuery(userQueries.home());
    void queryClient.prefetchQuery(catalogQueries.showsView());
    const featured = await queryClient.ensureQueryData(catalogQueries.featured());
    if (featured) return;
    await Promise.all([
      queryClient.ensureQueryData(catalogQueries.moviesView()),
      queryClient.ensureQueryData(catalogQueries.showsView()),
    ]);
  },
  pendingComponent: () => <PageSkeleton rails={3} />,
  component: HomePage,
});

function HomePage() {
  const webRuntime = useWebRuntime();

  const { data: featured } = useSuspenseQuery(webRuntime.queries.catalogQueries.featured());
  return featured ? <Home hero={featured} /> : <CatalogueHome />;
}

function CatalogueHome() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data: movies } = useSuspenseQuery(webRuntime.queries.catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(webRuntime.queries.catalogQueries.showsView());
  if (movies.length === 0 && shows.length === 0) {
    return (
      <PageFrame>
        <EmptyState.Root icon="movie">
          <EmptyState.Title>{t('content.homeEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('content.homeEmptyHint')}</EmptyState.Hint>
        </EmptyState.Root>
      </PageFrame>
    );
  }
  return <Home hero={movies[0] ? { type: 'movie', movie: movies[0] } : null} />;
}

function Home({ hero }: Readonly<{ hero: HeroEntry | null }>) {
  let heroId: string | null = null;
  if (hero) heroId = hero.type === 'movie' ? hero.movie.id : hero.show.id;
  return (
    <PageFrame>
      {hero ? <Hero entry={hero} /> : null}
      <ContinueRow />
      <HomeSections excludeId={heroId} />
      <Suspense fallback={<RailSkeleton />}>
        <ShowsRail />
      </Suspense>
    </PageFrame>
  );
}

function ShowsRail() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data: shows } = useSuspenseQuery(webRuntime.queries.catalogQueries.showsView());
  return <ShowRail title={t('nav.series')} shows={shows} />;
}
