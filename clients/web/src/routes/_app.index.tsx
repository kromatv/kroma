import { useT } from '@kromatv/ui';
import { EmptyState } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, Suspense } from 'react';
import { ContinueRow } from '#web/features/catalog/continue-row.component';
import { Hero, HeroSkeleton } from '#web/features/catalog/featured-hero.component';
import { HeroCarousel } from '#web/features/catalog/home/hero-carousel.component';
import { HomeSections, SectionsSkeleton } from '#web/features/catalog/home/home-sections.component';
import { isAuthed } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useHomeLiveRefresh } from '#web/shared/lib/use-live-refresh.hook';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { PageFrame } from '#web/shared/ui';

export const Route = createFileRoute('/_app/')({
  loader: ({ context: { runtime: webRuntime, queryClient } }) => {
    // The catalogue is auth-gated: skip until signed in (the gate covers the UI;
    // the root invalidates queries on login so these prefetch then).
    if (!isAuthed()) {
      return;
    }
    const { userQueries } = webRuntime.queries;
    void queryClient.prefetchQuery(userQueries.home());
    void queryClient.prefetchQuery(userQueries.continueWatching());
  },
  component: HomePage,
});

function HomePage() {
  useHomeLiveRefresh();
  return (
    <PageFrame>
      <SignedIn fallback={<HeroSkeleton />}>
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSlot />
        </Suspense>
      </SignedIn>
      <ContinueRow />
      <SignedIn fallback={<SectionsSkeleton />}>
        <Suspense fallback={<SectionsSkeleton />}>
          <HomeSections />
        </Suspense>
      </SignedIn>
    </PageFrame>
  );
}

function SignedIn({ fallback, children }: Readonly<{ fallback: ReactNode; children: ReactNode }>) {
  const { user, ready } = useAuth();
  return ready && user ? children : fallback;
}

function HeroSlot() {
  const { data: sections } = useSuspenseQuery(useWebRuntime().queries.userQueries.home());
  const hero = sections.find((section) => section.layout === 'hero' && section.items.length > 0);
  return hero ? <HeroCarousel section={hero} /> : <FeaturedHero />;
}

function FeaturedHero() {
  const { catalogQueries } = useWebRuntime().queries;
  const { data: featured } = useSuspenseQuery(catalogQueries.featured());
  return featured ? <Hero entry={featured} /> : <CatalogueHero />;
}

function CatalogueHero() {
  const { catalogQueries } = useWebRuntime().queries;
  const t = useT();
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());
  const first = movies[0];
  if (first) {
    return <Hero entry={{ type: 'movie', movie: first }} />;
  }
  if (shows.length > 0) {
    return null;
  }
  return (
    <EmptyState.Root icon="movie">
      <EmptyState.Title>{t('content.homeEmpty')}</EmptyState.Title>
      <EmptyState.Hint>{t('content.homeEmptyHint')}</EmptyState.Hint>
    </EmptyState.Root>
  );
}
