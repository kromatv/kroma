import type { PerfScopeRow } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { type SortColumn, Table, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PerfFlags } from '#web/features/admin/performance-flags.component';
import {
  figuresOf,
  SCOPE_FIGURES,
  SCOPE_SORT,
  scopeId,
  sortRows,
} from '#web/features/admin/performance-format';
import {
  type PerfColumn,
  PerfEmpty,
  PerfNumber,
  PerfTable,
} from '#web/features/admin/performance-table.component';
import { PerfLink } from '#web/features/admin/performance-link.component';

const COLUMNS: readonly PerfColumn[] = [
  { column: 'name', labelKey: 'perf.colName', flex: 2.4, min: 220 },
  { column: 'count', labelKey: 'perf.colCalls', width: 84, align: 'end' },
  { column: 'total', labelKey: 'perf.colTotal', width: 96, align: 'end' },
  { column: 'p50', labelKey: 'perf.colP50', width: 92, align: 'end' },
  { column: 'p95', labelKey: 'perf.colP95', width: 92, align: 'end' },
  { column: 'max', labelKey: 'perf.colMax', width: 92, align: 'end' },
  { column: 'sql', labelKey: 'perf.colSqlPerCall', width: 104, align: 'end' },
  { labelKey: 'perf.colRepeat', flex: 1, min: 96, align: 'end' },
  { labelKey: 'perf.colFlags', flex: 1.6, min: 180 },
];

function ScopeRow({ row }: Readonly<{ row: PerfScopeRow }>) {
  return (
    <Table.Row asChild>
      <PerfLink open={{ scope: scopeId(row) }}>
        <Table.Cell>
          <Text variant="label" font="mono" lines={1}>
            {row.name}
          </Text>
        </Table.Cell>
        {figuresOf(row, SCOPE_FIGURES).map(([column, value]) => (
          <Table.Cell key={column}>
            <PerfNumber>{value}</PerfNumber>
          </Table.Cell>
        ))}
        <Table.Cell>
          <PerfFlags flags={row.flags} />
        </Table.Cell>
      </PerfLink>
    </Table.Row>
  );
}

/** Routes or jobs, heaviest first until the reader sorts them otherwise; a row
 *  opens its drawer. */
export function PerfScopeTable({
  rows,
  labelKey,
}: Readonly<{ rows: readonly PerfScopeRow[]; labelKey: MessageKey }>) {
  const [sort, setSort] = useState<readonly SortColumn[]>([{ column: 'total', direction: 'desc' }]);
  if (rows.length === 0) {
    return <PerfEmpty icon="gauge" labelKey="perf.empty" />;
  }
  return (
    <PerfTable columns={COLUMNS} labelKey={labelKey} sort={sort} onSortChange={setSort}>
      {sortRows(rows, sort, SCOPE_SORT).map((row) => (
        <ScopeRow key={scopeId(row)} row={row} />
      ))}
    </PerfTable>
  );
}
