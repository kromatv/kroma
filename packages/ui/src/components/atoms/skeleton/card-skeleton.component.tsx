import { Box } from '#ui/components/atoms/box';
import { Skeleton } from './skeleton.component';

interface CardSkeletonProps {
  fields?: number;
}

/** The settings or form placeholder: a titled panel with a few label and field
 *  pairs. */
function CardSkeleton({ fields = 4 }: Readonly<CardSkeletonProps>) {
  return (
    <Box gap={16} p={24} radius="xl" border="borderStrong" bg="surface1" aria-hidden>
      <Skeleton h={24} w={160} />
      {Array.from({ length: fields }, (_, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- fixed-length placeholder fields
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
