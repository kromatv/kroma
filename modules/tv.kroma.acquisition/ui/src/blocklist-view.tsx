import { apiErrorText } from '@kromatv/client';
import {
  TABULAR,
  Table,
  type TableColumn,
  useAsyncAction,
  useFormat,
  useT,
} from '@kromatv/module-sdk';
import { Box, Callout, EmptyState, Row, Surface, TableSkeleton, Text } from '@kromatv/ui/kit';
import { useAcquisitionApi } from './api';
import type { BlockedRelease } from './rules-schemas';
import { useBlocklist } from './use-rules';

const COLUMNS: TableColumn[] = [{}, { width: 150, from: 'md' }, { width: 120 }, { width: 44 }];

export function BlocklistView() {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const blocked = useBlocklist();
  const action = useAsyncAction();
  const entries = blocked.data ?? [];

  const unblock = (entry: BlockedRelease) =>
    action.run(
      async () => {
        await acquisition.unblock(entry.id);
        await blocked.reload();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  if (blocked.loading) return <TableSkeleton rows={5} />;

  return (
    <Box gap={14}>
      <Text variant="meta" color="textDim">
        {t('acq.blocklistHint')}
      </Text>

      {action.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{action.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      {entries.length === 0 ? (
        <Surface radius="xl" pad="lg">
          <EmptyState.Root icon="shield-check">
            <EmptyState.Title>{t('acq.blocklistEmpty')}</EmptyState.Title>
            <EmptyState.Hint>{t('acq.blocklistEmptyHint')}</EmptyState.Hint>
          </EmptyState.Root>
        </Surface>
      ) : (
        <Table.Root columns={COLUMNS} label={t('acq.tabBlocklist')}>
          <Table.Header>
            <Table.Column>{t('requests.colRelease')}</Table.Column>
            <Table.Column>{t('acq.colReason')}</Table.Column>
            <Table.Column>{t('acq.colAdded')}</Table.Column>
            <Table.Cell />
          </Table.Header>
          {entries.map((entry) => (
            <BlockedRow key={entry.id} entry={entry} busy={action.busy} onUnblock={unblock} />
          ))}
        </Table.Root>
      )}
    </Box>
  );
}

function BlockedRow({
  entry,
  busy,
  onUnblock,
}: Readonly<{
  entry: BlockedRelease;
  busy: boolean;
  onUnblock: (entry: BlockedRelease) => void;
}>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0}>
          <Text variant="meta" lines={1}>
            {entry.releaseTitle}
          </Text>
          <Row wrap gapX={10} mt={2}>
            <Text variant="meta" color="textDim">
              {t(entry.kind === 'movie' ? 'acq.kindMovie' : 'acq.kindShow')} · {entry.tmdbId}
            </Text>
            {entry.indexerId ? (
              <Text variant="meta" color="textDim" lines={1}>
                {entry.indexerId}
              </Text>
            ) : null}
          </Row>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="dangerHover" lines={1}>
          {entry.reason}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" style={TABULAR}>
          {fmt.elapsed(entry.addedAt)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Table.Action
          tone="dangerHover"
          icon="trash"
          label={t('acq.unblock')}
          disabled={busy}
          onPress={() => onUnblock(entry)}
        />
      </Table.Cell>
    </Table.Row>
  );
}
