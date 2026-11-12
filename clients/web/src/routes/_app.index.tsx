import { useT } from '@kromatv/ui';
import { EmptyState } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ShowRail } from '#web/features/catalog/cards';
import { ContinueRow } from '#web/features/catalog/continue-row';
import { Hero, HeroSkeleton } from '#web/features/catalog/featured-hero';
import { HomeSections, SectionsSkeleton } from '#web/features/catalog/home-sections';
import { isAuthed } from '#web/shared/lib/api';
import type { HeroEntry } from '#web/shared/lib/queries';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { PageFrame, RailSkeleton } from '#web/shared/ui';

export const Route = createFileRoute('/_app/')({
  loader: ({ context: { runtime: webRuntime, queryClient } }) => {
    // The catalogue is auth-gated: skip until signed in (the gate covers the UI;
    // the root invalidates queries on login so these prefetch then).
    if (!isAuthed()) return;
    const { catalogQueries, userQueries } = webRuntime.queries;
    void queryClient.prefetchQuery(catalogQueries.featured());
    void queryClient.prefetchQuery(userQueries.continueWatching());
    void queryClient.prefetchQuery(userQueries.home());
    void queryClient.prefetchQuery(catalogQueries.showsView());
  },
  component: HomePage,
});

function HomePage() {
  return (
    <PageFrame>
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSlot />
      </Suspense>
      <ContinueRow />
      <Suspense fallback={<SectionsSkeleton />}>
        <SectionsSlot />
      </Suspense>
      <Suspense fallback={<RailSkeleton />}>
        <ShowsRail />
      </Suspense>
    </PageFrame>
  );
}

function useFeatured(): HeroEntry | null {
  return useSuspenseQuery(useWebRuntime().queries.catalogQueries.featured()).data;
}

const heroId = (hero: HeroEntry) => (hero.type === 'movie' ? hero.movie.id : hero.show.id);

function HeroSlot() {
  const featured = useFeatured();
  return featured ? <Hero entry={featured} /> : <CatalogueHero />;
}

function CatalogueHero() {
  const { catalogQueries } = useWebRuntime().queries;
  const t = useT();
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());
  const first = movies[0];
  if (first) return <Hero entry={{ type: 'movie', movie: first }} />;
  if (shows.length > 0) return null;
  return (
    <EmptyState.Root icon="movie">
      <EmptyState.Title>{t('content.homeEmpty')}</EmptyState.Title>
      <EmptyState.Hint>{t('content.homeEmptyHint')}</EmptyState.Hint>
    </EmptyState.Root>
  );
}

function SectionsSlot() {
  const featured = useFeatured();
  return featured ? <HomeSections excludeId={heroId(featured)} /> : <CatalogueSections />;
}

function CatalogueSections() {
  const { data: movies } = useSuspenseQuery(useWebRuntime().queries.catalogQueries.moviesView());
  return <HomeSections excludeId={movies[0]?.id ?? null} />;
}

function ShowsRail() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data: shows } = useSuspenseQuery(webRuntime.queries.catalogQueries.showsView());
  return <ShowRail title={t('nav.series')} shows={shows} />;
}
