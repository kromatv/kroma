// Catalogue-specific loading placeholders, shaped like the layouts they stand
// in for. The pulsing primitives come from @kroma/ui/kit; the wrappers here
// only reproduce the pages' own grids and gutters.

import { Box, PosterSkeleton, Skeleton } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import { PAGE_MAIN, POSTER_GRID } from '#web/shared/ui/page';

export { CardSkeleton, Skeleton, TableSkeleton } from '@kroma/ui/kit';

// Viewport heights and the fluid gutter, neither of which a style number can
// carry, so the three bands the catalogue opens with stay plain elements.
const HOME_BAND: CSSProperties = { width: '100%', height: '46vh', minHeight: 320 };

const DETAIL_BAND: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '56vh',
  minHeight: 384,
  overflow: 'hidden',
};

const GUTTER: CSSProperties = { paddingInline: 'var(--gutter-web)' };

// The web tiles are sized by `--card-w`, a fluid CSS variable no React Native
// prop can carry, so the cell states the width and the kit tile fills it.
function PosterCell() {
  return (
    <div style={{ width: 'var(--card-w)', flexShrink: 0 }}>
      <PosterSkeleton />
    </div>
  );
}

/** Mirrors the pages' auto-fill grid (cards.tsx) so tiles line up. */
export function SkeletonRow({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <div className={POSTER_GRID}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder grid
        <PosterCell key={i} />
      ))}
    </div>
  );
}

export function RailSkeleton({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <section>
      <Skeleton h={24} w={208} mt={40} mb={20} />
      <Box row gap={18} overflow="hidden" py={16}>
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rail
          <PosterCell key={i} />
        ))}
      </Box>
    </section>
  );
}

export function PageSkeleton({ rails = 3 }: Readonly<{ rails?: number }>) {
  return (
    <main className={PAGE_MAIN}>
      <div style={HOME_BAND}>
        <Skeleton h="100%" w="100%" radius={16} />
      </div>
      {Array.from({ length: rails }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rails
        <RailSkeleton key={i} />
      ))}
    </main>
  );
}

export function DetailSkeleton() {
  return (
    <main>
      <Box pb={64}>
        <div style={DETAIL_BAND}>
          <Skeleton h="100%" w="100%" radius={0} />
        </div>
        <div style={GUTTER}>
          <Skeleton h={40} w="40%" mt={-96} />
          <Box row gap={12} mt={16}>
            <Skeleton h={24} w={64} />
            <Skeleton h={24} w={64} />
            <Skeleton h={24} w={96} />
          </Box>
          <Box mt={24} maxW={672}>
            <Skeleton shape="text" lines={3} />
          </Box>
          <Box row gap={12} mt={32}>
            <Skeleton h={48} w={144} radius="lg" />
            <Skeleton h={48} w={48} radius="lg" />
          </Box>
          <RailSkeleton count={6} />
        </div>
      </Box>
    </main>
  );
}
