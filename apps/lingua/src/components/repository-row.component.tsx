import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import type { ReactNode } from 'react';
import { SyncBadge, SyncProgress } from '#site/components/sync-status.component';
import { SyncError } from '#site/components/sync-error.component';
import { ago } from '#site/lib/ago';
import { whileDriven } from '#site/lib/sync-facts';
import { useSyncNow } from '#site/lib/use-sync-now.hook';
import type { RepositoryStatus } from '#site/lib/views';

function factsOf({ branch, checkedAt }: RepositoryStatus): string {
  const tracked = branch === null ? 'Default branch' : `Branch ${branch}`;
  const checked = checkedAt === null ? 'never checked' : `checked ${ago(checkedAt)}`;
  return `${tracked} · ${checked}`;
}

/** Why the last sync of a repository stopped, from this page's own sync or the last pass. */
export function SyncStopped({ error }: Readonly<{ error: string | null }>) {
  if (error === null) {
    return null;
  }
  return (
    <Callout.Root tone="danger" size="sm" icon="alert-triangle">
      <Callout.Title>The last sync stopped</Callout.Title>
      <Callout.Detail>{error}</Callout.Detail>
    </Callout.Root>
  );
}

function Heading({
  repository,
  children,
}: Readonly<{ repository: RepositoryStatus; children: ReactNode }>) {
  return (
    <Row gap={12} wrap between align="center">
      <Column gap={2} shrink={1} minW={0}>
        <Text variant="label">{repository.id}</Text>
        <Text variant="meta" color="textDim">
          {factsOf(repository)}
        </Text>
      </Column>
      <Row gap={10} align="center" minH={40}>
        {children}
      </Row>
    </Row>
  );
}

/**
 * One repository on the status page: the branch Lingua tracks, its last
 * check, where its sync stands, and, for a signed-in viewer while nothing
 * reads it, a way to sync it now.
 */
export function RepositoryRow({
  repository,
  canSync,
}: Readonly<{ repository: RepositoryStatus; canSync: boolean }>) {
  const syncing = useSyncNow(repository.id);
  const shown = syncing.live ?? repository;
  const sync = syncing.running ? whileDriven(shown.sync) : shown.sync;
  const stopped = syncing.error ?? (sync.kind === 'failed' ? sync.error : null);
  return (
    <Box bg="bg" border="border" radius="lg" px={14} py={12} gap={12}>
      <Heading repository={shown}>
        <SyncBadge sync={sync} />
        {canSync && sync.kind !== 'reading' ? (
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            label="Sync now"
            onPress={() => void syncing.run()}
          />
        ) : null}
      </Heading>
      <SyncProgress sync={sync} />
      <SyncStopped error={stopped} />
      {shown.configError ? <SyncError error={shown.configError} /> : null}
    </Box>
  );
}
