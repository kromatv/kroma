import type { PerfSlowRequest, PerfWindow } from '@kromatv/client/performance';
import { useFormat } from '@kromatv/ui';
import { type SortColumn, Table, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  figuresOf,
  SLOW_FIGURES,
  SLOW_SORT,
  sortRows,
} from '#web/features/admin/performance-format';
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
        {figuresOf(row, SLOW_FIGURES).map(([column, value]) => (
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
      {sortRows(data.requests, sort, SLOW_SORT).map((row) => (
        <SlowRow key={row.id} row={row} />
      ))}
    </PerfTable>
  );
}
