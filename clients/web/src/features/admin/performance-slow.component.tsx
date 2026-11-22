import type { PerfSlowRequest, PerfWindow } from '@kromatv/client/performance';
import { useFormat } from '@kromatv/ui';
import { type SortColumn, Table, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { formatMs, sortRows } from '#web/features/admin/performance-format';
import {
  type PerfColumn,
  PerfEmpty,
  PerfNumber,
  PerfTable,
} from '#web/features/admin/performance-table.component';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';
import { PerfLink } from '#web/features/admin/performance-link.component';

const COLUMNS: readonly PerfColumn[] = [
  { column: 'at', labelKey: 'perf.colAt', width: 130 },
  { column: 'name', labelKey: 'perf.colName', flex: 2.4, min: 220 },
  { labelKey: 'perf.colStatus', width: 80, align: 'end' },
  { column: 'total', labelKey: 'perf.colTotal', width: 96, align: 'end' },
  { column: 'sql', labelKey: 'perf.colSql', width: 120, align: 'end' },
  { labelKey: 'perf.colRepeat', flex: 1, min: 120, align: 'end' },
];

const READ = {
  at: (row: PerfSlowRequest) => row.atMs,
  name: (row: PerfSlowRequest) => row.name,
  total: (row: PerfSlowRequest) => row.totalMs,
  sql: (row: PerfSlowRequest) => row.kinds.sql?.ms ?? 0,
};

function figures(row: PerfSlowRequest): [string, string][] {
  const sql = row.kinds.sql;
  const top = row.repeats[0];
  return [
    ['status', row.status === null ? '-' : String(row.status)],
    ['total', formatMs(row.totalMs)],
    ['sql', sql ? `${sql.count} · ${formatMs(sql.ms)}` : '-'],
    ['repeat', top ? `${top.count}×` : '-'],
  ];
}

function SlowRow({ row }: Readonly<{ row: PerfSlowRequest }>) {
  const fmt = useFormat();
  return (
    <Table.Row asChild>
      <PerfLink open={{ slow: row.id }}>
        <Table.Cell>
          <Text variant="meta" color="textDim" lines={1}>
            {fmt.elapsed(row.atMs)}
          </Text>
        </Table.Cell>
        <Table.Cell>
          <Text variant="label" font="mono" lines={1}>
            {row.name}
          </Text>
        </Table.Cell>
        {figures(row).map(([column, value]) => (
          <Table.Cell key={column}>
            <PerfNumber>{value}</PerfNumber>
          </Table.Cell>
        ))}
      </PerfLink>
    </Table.Row>
  );
}

/** The requests of the period that were slow or ran one segment in a loop,
 *  newest first; a row opens its waterfall. */
export function PerfSlowList({ window }: Readonly<{ window: PerfWindow }>) {
  const { client } = useAuth();
  const [sort, setSort] = useState<readonly SortColumn[]>([{ column: 'at', direction: 'desc' }]);
  const { data } = usePoll(
    ['admin', 'performance', 'slow', window],
    () => client.performance.slow(window),
    10000,
  );
  if (data === null) {
    return <TableSkeleton rows={8} />;
  }
  if (data.requests.length === 0) {
    return <PerfEmpty icon="stopwatch" labelKey="perf.emptySlow" />;
  }
  return (
    <PerfTable columns={COLUMNS} labelKey="perf.tabSlow" sort={sort} onSortChange={setSort}>
      {sortRows(data.requests, sort, READ).map((row) => (
        <SlowRow key={row.id} row={row} />
      ))}
    </PerfTable>
  );
}
