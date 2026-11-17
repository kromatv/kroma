import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { SyncStopped } from '#site/components/repository-row.component';
import { SyncBadge, SyncProgress } from '#site/components/sync-status.component';
import { ago } from '#site/lib/ago';
import type { SyncState } from '#site/lib/views';

/** A sync the page can start, and why the last one it started stopped. */
export interface SyncDrive {
  error: string | null;
  run: () => Promise<void>;
}

/**
 * Where a project's sync stands, under its header: the badge, when it last
 * finished, how far a read has come, why it stopped, and, for a contributor
 * while nothing reads, "Sync now".
 */
export function SyncStrip({
  sync,
  syncedAt,
  drive,
}: Readonly<{ sync: SyncState; syncedAt: number | null; drive: SyncDrive | null }>) {
  const stopped = drive?.error ?? (sync.kind === 'failed' ? sync.error : null);
  return (
    <Box gap={10} p={14} radius="xl" bg="surface1" border="border">
      <Row gap={10} wrap align="center" between>
        <Row gap={10} align="center" wrap>
          <SyncBadge sync={sync} />
          <Text variant="meta" color="textDim">
            {syncedAt === null ? 'Not read yet' : `Last synced ${ago(syncedAt)}`}
          </Text>
        </Row>
        {drive && sync.kind !== 'reading' ? (
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            label="Sync now"
            onPress={() => void drive.run()}
          />
        ) : null}
      </Row>
      <SyncProgress sync={sync} />
      <SyncStopped error={stopped} />
    </Box>
  );
}
