import { Box, PageMain, PosterSkeleton, rhythm, Skeleton } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import { PAGE_GUTTER, PageFrame } from '#web/shared/ui/page';
import { TileGrid } from '#web/shared/ui/tile-grid';

export { CardSkeleton, Skeleton, TableSkeleton } from '@kroma/ui/kit';

const HOME_BAND: CSSProperties = { width: '100%', height: '46vh', minHeight: 320 };

const DETAIL_BAND: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '56vh',
  minHeight: 384,
  overflow: 'hidden',
};

export function SkeletonRow({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <TileGrid>
      {(width) =>
        Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder grid
          <PosterSkeleton key={i} width={width} />
        ))
      }
    </TileGrid>
  );
}

export function RailSkeleton({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <Box>
      <Skeleton h={24} w={208} mt={40} mb={20} />
      <Box row gap={rhythm.rowGap} overflow="hidden" py={16}>
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rail
          <PosterSkeleton key={i} width={rhythm.cardWidth} />
        ))}
      </Box>
    </Box>
  );
}

export function PageSkeleton({ rails = 3 }: Readonly<{ rails?: number }>) {
  return (
    <PageFrame>
      <div style={HOME_BAND}>
        <Skeleton h="100%" w="100%" radius={16} />
      </div>
      {Array.from({ length: rails }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rails
        <RailSkeleton key={i} />
      ))}
    </PageFrame>
  );
}

export function DetailSkeleton() {
  return (
    <PageMain>
      <Box pb={64}>
        <div style={DETAIL_BAND}>
          <Skeleton h="100%" w="100%" radius={0} />
        </div>
        <Box px={PAGE_GUTTER}>
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
        </Box>
      </Box>
    </PageMain>
  );
}
