// <TableSkeleton>: the list/table placeholder - a bordered panel of evenly
// spaced rows, each an icon well + a long bar + two short cells. A fixed-length
// placeholder that never reorders, so an index key is correct.

import { Box } from '#ui/components/atoms/box';
import { Skeleton } from './skeleton';

interface TableSkeletonProps {
  rows?: number;
}

function TableSkeleton({ rows = 8 }: Readonly<TableSkeletonProps>) {
  return (
    <Box gap={8} p={12} radius="lg" border="borderStrong" bg="surface1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
        <Box key={i} row align="center" gap={16} py={8}>
          <Skeleton w={36} h={36} radius={8} />
          <Skeleton h={16} flex />
          <Skeleton h={16} w={96} />
          <Skeleton h={32} w={80} radius={8} />
        </Box>
      ))}
    </Box>
  );
}

export type { TableSkeletonProps };
export { TableSkeleton };
