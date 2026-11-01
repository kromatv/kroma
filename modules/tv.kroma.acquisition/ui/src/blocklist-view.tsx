import { apiErrorText } from '@kromatv/client';
import {
  TABULAR,
  Table,
  type TableColumn,
  useAsyncAction,
  useFormat,
  useT,
} from '@kromatv/module-sdk';
import {
  Box,
  Callout,
  EmptyState,
  Pagination,
  Row,
  Surface,
  TableSkeleton,
  Text,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import type { BlockedRelease } from './judgement-schemas';
import { useBlocklist } from './use-rules';

const COLUMNS: TableColumn[] = [{}, { width: 150, from: 'md' }, { width: 120 }, { width: 64 }];

const PER_PAGE = 25;

export function BlocklistView() {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const blocked = useBlocklist();
  const action = useAsyncAction();
  const [page, setPage] = useState(1);
  const entries = blocked.data ?? [];
  const pageCount = Math.max(1, Math.ceil(entries.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = entries.slice((current - 1) * PER_PAGE, current * PER_PAGE);

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
          {shown.map((entry) => (
            <BlockedRow key={entry.id} entry={entry} busy={action.busy} onUnblock={unblock} />
          ))}
        </Table.Root>
      )}

      {pageCount > 1 ? (
        <Row justify="flex-end">
          <Pagination.Root
            page={current}
            pageCount={pageCount}
            onPageChange={setPage}
            label={t('acq.tabBlocklist')}
            size="sm"
          />
        </Row>
      ) : null}
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
