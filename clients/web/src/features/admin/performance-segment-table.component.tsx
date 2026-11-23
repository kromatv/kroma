import type { PerfSegmentRow } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { Box, type SortColumn, Table, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PerfFlags } from '#web/features/admin/performance-flags.component';
import {
  figuresOf,
  SEGMENT_FIGURES,
  SEGMENT_SORT,
  shortLabel,
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
  { column: 'label', labelKey: 'perf.colStatement', flex: 3, min: 260 },
  { column: 'count', labelKey: 'perf.colCalls', width: 84, align: 'end' },
  { column: 'total', labelKey: 'perf.colTotal', width: 96, align: 'end' },
  { column: 'p95', labelKey: 'perf.colP95', width: 92, align: 'end' },
  { column: 'max', labelKey: 'perf.colMax', width: 92, align: 'end' },
  { column: 'rows', labelKey: 'perf.colRowsPerCall', width: 120, align: 'end' },
  { labelKey: 'perf.colFlags', flex: 1.4, min: 160 },
];

function SegmentRow({ row }: Readonly<{ row: PerfSegmentRow }>) {
  return (
    <Table.Row asChild>
      <PerfLink open={{ segment: row.key }}>
        <Table.Cell>
          <Box minW={0}>
            <Text variant="meta" font="mono" lines={1}>
              {shortLabel(row.label)}
            </Text>
            <Text variant="meta" color="textDim" lines={1}>
              {row.origin ?? row.kind}
            </Text>
          </Box>
        </Table.Cell>
        {figuresOf(row, SEGMENT_FIGURES).map(([column, value]) => (
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

/** Statements, spans or measured calls, heaviest first until the reader sorts
 *  them otherwise; a row opens its drawer. */
export function PerfSegmentTable({
  rows,
  labelKey,
}: Readonly<{ rows: readonly PerfSegmentRow[]; labelKey: MessageKey }>) {
  const [sort, setSort] = useState<readonly SortColumn[]>([{ column: 'total', direction: 'desc' }]);
  if (rows.length === 0) {
    return <PerfEmpty icon="database" labelKey="perf.empty" />;
  }
  return (
    <PerfTable columns={COLUMNS} labelKey={labelKey} sort={sort} onSortChange={setSort}>
      {sortRows(rows, sort, SEGMENT_SORT).map((row) => (
        <SegmentRow key={row.key} row={row} />
      ))}
    </PerfTable>
  );
}
