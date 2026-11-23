import type { PerfLiveRow } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Table, Text } from '@kromatv/ui/kit';
import { formatMs, shortLabel } from '#web/features/admin/performance-format';
import {
  type PerfColumn,
  PerfEmpty,
  PerfNumber,
  PerfTable,
} from '#web/features/admin/performance-table.component';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const COLUMNS: readonly PerfColumn[] = [
  { labelKey: 'perf.colName', flex: 2, min: 220 },
  { labelKey: 'perf.colKind', width: 96 },
  { labelKey: 'perf.colElapsed', width: 110, align: 'end' },
  { labelKey: 'perf.colSql', width: 120, align: 'end' },
  { labelKey: 'perf.colLast', flex: 2, min: 220 },
];

const KIND: Readonly<Record<PerfLiveRow['kind'], MessageKey>> = {
  request: 'perf.kindRequest',
  job: 'perf.kindJob',
};

function LiveRow({ row }: Readonly<{ row: PerfLiveRow }>) {
  const t = useT();
  const sql = row.kinds.sql;
  return (
    <Table.Row>
      <Table.Cell>
        <Text variant="label" font="mono" lines={1}>
          {row.name}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted">
          {t(KIND[row.kind])}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <PerfNumber>{formatMs(row.elapsedMs)}</PerfNumber>
      </Table.Cell>
      <Table.Cell>
        <PerfNumber>{sql ? `${sql.count} · ${formatMs(sql.ms)}` : '-'}</PerfNumber>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" font="mono" color="textDim" lines={1}>
          {row.last ? shortLabel(row.last.label) : '-'}
        </Text>
      </Table.Cell>
    </Table.Row>
  );
}

/** What the server is doing right now, longest-running first, every two seconds. */
export function PerfLive() {
  const { client } = useAuth();
  const { data } = usePoll(['admin', 'performance', 'live'], () => client.performance.live(), 2000);
  if (data === null) {
    return <TableSkeleton rows={4} />;
  }
  if (data.running.length === 0) {
    return <PerfEmpty icon="player-play" labelKey="perf.emptyLive" />;
  }
  return (
    <PerfTable columns={COLUMNS} labelKey="perf.tabLive" sort={[]} onSortChange={() => {}}>
      {data.running.map((row) => (
        <LiveRow key={row.id} row={row} />
      ))}
    </PerfTable>
  );
}
