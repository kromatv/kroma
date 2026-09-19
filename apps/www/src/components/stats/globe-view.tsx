import { ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import type { GlobeProps } from '#site/components/stats/globe/globe';
import { GlobeBoundary } from '#site/components/stats/globe-boundary';
import { GlobeFrame } from '#site/components/stats/globe-frame';

const Globe = lazy(() =>
  import('#site/components/stats/globe/globe').then((mod) => ({ default: mod.Globe })),
);

/**
 * The globe, on the client only and in its own chunk: three.js is fetched once
 * the page has hydrated and never runs in the prerender, which draws the frame.
 */
export function GlobeView(props: Readonly<GlobeProps>) {
  return (
    <ClientOnly fallback={<GlobeFrame />}>
      <GlobeBoundary fallback={<GlobeFrame />}>
        <Suspense fallback={<GlobeFrame />}>
          <Globe {...props} />
        </Suspense>
      </GlobeBoundary>
    </ClientOnly>
  );
}
