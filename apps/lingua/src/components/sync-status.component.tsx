import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column } from '@kromatv/ui/kit/atoms/box';
import { Progress } from '@kromatv/ui/kit/atoms/progress';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { syncFacts } from '#site/lib/sync-facts';
import type { SyncState } from '#site/lib/views';

/** Where a repository's sync stands, as one badge. */
export function SyncBadge({ sync }: Readonly<{ sync: SyncState }>) {
  const { tone, label } = syncFacts(sync);
  return (
    <Box>
      <Badge tone={tone}>{label}</Badge>
    </Box>
  );
}

/** How far a sync has read, while it reads; nothing otherwise. */
export function SyncProgress({ sync }: Readonly<{ sync: SyncState }>) {
  if (sync.kind !== 'reading') {
    return null;
  }
  const facts = syncFacts(sync);
  return (
    <Column gap={6} accessibilityLiveRegion="polite">
      <Progress
        value={facts.ratio ?? 0}
        indeterminate={facts.ratio === null}
        thickness={4}
        color="accent"
        label="Files read"
      />
      <Text variant="meta" color="textDim">
        {facts.detail}
      </Text>
    </Column>
  );
}
