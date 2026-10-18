import { Box, Grid, Row, Skeleton } from '@kromatv/ui/kit';

const STATS = [0, 1, 2];

export function MonitoringDetailSkeleton() {
  return (
    <Box gap={28} aria-busy>
      <Row gap={14} align="center">
        <Skeleton w={36} h={36} radius="circle" />
        <Skeleton w={220} h={28} radius="sm" />
      </Row>
      <Skeleton w="100%" h={240} radius="xl" />
      <Grid min={200} gap={16}>
        {STATS.map((card) => (
          <Skeleton key={card} w="100%" h={92} radius="xl" />
        ))}
      </Grid>
      <Box gap={12}>
        <Skeleton w={120} h={14} radius="xs" />
        <Skeleton w="100%" h={148} radius="xl" />
      </Box>
      <Box gap={12}>
        <Skeleton w={120} h={14} radius="xs" />
        <Skeleton w="100%" h={76} radius="xl" />
        <Skeleton w="100%" h={76} radius="xl" />
      </Box>
    </Box>
  );
}
