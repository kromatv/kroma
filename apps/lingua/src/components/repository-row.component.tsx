import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { SyncError } from '#site/components/sync-error.component';
import type { RepositoryStatus, SyncState } from '#site/lib/views';

const minuteOf = (seconds: number) =>
  `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function factsOf({ branch, checkedAt }: RepositoryStatus): string {
  const tracked = branch === null ? 'Default branch not read yet' : `Branch ${branch}`;
  const checked = checkedAt === null ? 'not checked yet' : `checked ${minuteOf(checkedAt)}`;
  return `${tracked} · ${checked}`;
}

function SyncBadge({ sync }: Readonly<{ sync: SyncState }>) {
  if (sync.kind === 'current') {
    return <Badge tone="success">Up to date</Badge>;
  }
  if (sync.kind === 'failed') {
    return <Badge tone="danger">Sync failed</Badge>;
  }
  if (sync.kind === 'reading') {
    const { progress } = sync;
    return (
      <Badge tone="warning">
        {progress ? `Reading ${progress.done} of ${progress.total} files` : 'Reading changes'}
      </Badge>
    );
  }
  return <Badge tone="neutral">Not read yet</Badge>;
}

/** One repository on `/setup`: the branch Lingua tracks, its last check, where its sync stands, and why it failed. */
export function RepositoryRow({ repository }: Readonly<{ repository: RepositoryStatus }>) {
  const { sync } = repository;
  return (
    <Box bg="bg" border="border" radius="lg" px={14} py={12} gap={10}>
      <Row gap={12} wrap between align="center">
        <Column gap={2} shrink={1} minW={0}>
          <Text variant="label">{repository.id}</Text>
          <Text variant="meta" color="textDim">
            {factsOf(repository)}
          </Text>
        </Column>
        <SyncBadge sync={sync} />
      </Row>
      {sync.kind === 'failed' ? (
        <Callout.Root tone="danger" size="sm" icon="alert-triangle">
          <Callout.Title>The last sync stopped</Callout.Title>
          <Callout.Detail>{sync.error}</Callout.Detail>
        </Callout.Root>
      ) : null}
      {repository.configError ? <SyncError error={repository.configError} /> : null}
    </Box>
  );
}
