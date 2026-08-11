// <CardSkeleton>: the settings/form placeholder - a titled panel with a few
// label + field pairs. A fixed-length placeholder that never reorders, so an
// index key is correct.

import { Box } from '#ui/components/atoms/box';
import { Skeleton } from './skeleton';

interface CardSkeletonProps {
  fields?: number;
}

function CardSkeleton({ fields = 4 }: Readonly<CardSkeletonProps>) {
  return (
    <Box gap={16} p={24} radius="lg" border="borderStrong" bg="surface1" aria-hidden>
      <Skeleton h={24} w={160} />
      {Array.from({ length: fields }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder fields
        <Box key={i} gap={8}>
          <Skeleton h={14} w={112} bg="tint/4" />
          <Skeleton h={40} self="stretch" radius="sm" />
        </Box>
      ))}
    </Box>
  );
}

export type { CardSkeletonProps };
export { CardSkeleton };
