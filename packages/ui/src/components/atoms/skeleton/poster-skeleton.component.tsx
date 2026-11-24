import { Box } from '#ui/components/atoms/box';
import { Skeleton } from './skeleton.component';

interface PosterSkeletonProps {
  /** An explicit tile width. Omit inside a grid cell, which already sets one. */
  width?: number;
}

/** The loading twin of <PosterCard>: the 2:3 art, then the title and meta lines.
 *  It fills its cell like the card does, so a grid or a rail keeps its columns
 *  while the data is out. */
function PosterSkeleton({ width }: Readonly<PosterSkeletonProps>) {
  return (
    <Box w={width ?? '100%'} aria-hidden>
      <Skeleton shape="poster" w="100%" />
      <Skeleton h={14} w="75%" mt={10} />
      <Skeleton h={12} w="33%" mt={6} bg="tint/4" />
    </Box>
  );
}

export type { PosterSkeletonProps };
export { PosterSkeleton };
