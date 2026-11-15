import { Box, Divider, Row, Surface } from '@kromatv/ui/kit';
import { Skeleton } from '#web/shared/ui';

const SKELETON_ROWS = [3, 2, 4];

export function MissingSkeleton() {
  return (
    <Box mt={24} gap={12} aria-busy>
      {SKELETON_ROWS.map((rows, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- fixed-length placeholder cards
        <GroupSkeleton key={i} rows={rows} />
      ))}
    </Box>
  );
}

function GroupSkeleton({ rows }: Readonly<{ rows: number }>) {
  return (
    <Surface pad="none" radius="xl" border="border" overflow="hidden">
      <Row gap={16} p={14}>
        <Skeleton w={20} h={20} radius="sm" />
        <Skeleton w={46} h={68} radius="sm" />
        <Box minW={0} flex>
          <Skeleton shape="text" lines={2} variant="meta" maxW={220} />
        </Box>
        <Skeleton w={110} h={40} radius="md" />
      </Row>
      <Divider color="tint/6" />
      {Array.from({ length: rows }, (_, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- fixed-length placeholder rows
        <Row key={i} gap={16} px={14} py={14}>
          <Skeleton w={20} h={20} radius="sm" />
          <Skeleton w={62} h={12} radius="pill" />
          <Skeleton w="28%" h={12} radius="pill" />
        </Row>
      ))}
    </Surface>
  );
}
