import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Progress } from '@kromatv/ui/kit/atoms/progress';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { SyncError } from '#site/components/sync-error.component';
import { ago } from '#site/lib/ago';
import { useSyncNow } from '#site/lib/use-sync-now.hook';
import type { RepositoryStatus, SyncState } from '#site/lib/views';

function factsOf({ branch, checkedAt }: RepositoryStatus): string {
  const tracked = branch === null ? 'Default branch' : `Branch ${branch}`;
  const checked = checkedAt === null ? 'never read' : `checked ${ago(checkedAt)}`;
  return `${tracked} · ${checked}`;
}

function SyncBadge({ sync, running }: Readonly<{ sync: SyncState; running: boolean }>) {
  if (running || sync.kind === 'reading') {
    return <Badge tone="warning">Syncing</Badge>;
  }
  if (sync.kind === 'current') {
    return <Badge tone="success">Up to date</Badge>;
  }
  if (sync.kind === 'failed') {
    return <Badge tone="danger">Sync failed</Badge>;
  }
  return <Badge tone="neutral">Not read yet</Badge>;
}

function Reading({ sync }: Readonly<{ sync: SyncState }>) {
  if (sync.kind !== 'reading' || sync.progress === null) {
    return null;
  }
  const { done, total } = sync.progress;
  return (
    <Column gap={6}>
      <Progress value={total === 0 ? 0 : done / total} thickness={6} label="Files read" />
      <Text variant="meta" color="textDim">
        {`Read ${done} of ${total} catalog files`}
      </Text>
    </Column>
  );
}

function Problems({
  repository,
  error,
}: Readonly<{ repository: RepositoryStatus; error: string | null }>) {
  const { sync } = repository;
  return (
    <>
      {sync.kind === 'failed' || error ? (
        <Callout.Root tone="danger" size="sm" icon="alert-triangle">
          <Callout.Title>The last sync stopped</Callout.Title>
          <Callout.Detail>{error ?? (sync.kind === 'failed' ? sync.error : '')}</Callout.Detail>
        </Callout.Root>
      ) : null}
      {repository.configError ? <SyncError error={repository.configError} /> : null}
    </>
  );
}

function SyncButton({ running, onPress }: Readonly<{ running: boolean; onPress: () => void }>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="refresh"
      label="Sync now"
      loading={running}
      onPress={onPress}
    />
  );
}

/**
 * One repository on `/setup`: the branch Lingua tracks, its last check, where
 * its sync stands, and, for a signed-in viewer, a way to sync it now.
 */
export function RepositoryRow({
  repository,
  canSync,
}: Readonly<{ repository: RepositoryStatus; canSync: boolean }>) {
  const sync = useSyncNow(repository.id);
  const shown = sync.live ?? repository;
  return (
    <Box bg="bg" border="border" radius="lg" px={14} py={12} gap={12}>
      <Row gap={12} wrap between align="center">
        <Column gap={2} shrink={1} minW={0}>
          <Text variant="label">{shown.id}</Text>
          <Text variant="meta" color="textDim">
            {factsOf(shown)}
          </Text>
        </Column>
        <Row gap={10} align="center">
          <SyncBadge sync={shown.sync} running={sync.running} />
          {canSync ? <SyncButton running={sync.running} onPress={() => void sync.run()} /> : null}
        </Row>
      </Row>
      <Reading sync={shown.sync} />
      <Problems repository={shown} error={sync.error} />
    </Box>
  );
}
