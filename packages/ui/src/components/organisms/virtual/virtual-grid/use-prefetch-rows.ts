import { useMemo, useState } from 'react';
import { usePrefetchAhead } from '#ui/lib/use-prefetch-ahead';
import { aheadRows } from './ahead-rows';
import type { RowMetrics, RowWindow } from './grid-rows';

interface PrefetchRowsArgs<T> {
  data: readonly T[];
  art: ((item: T, width: number) => string | null) | undefined;
  focusedRow: number;
  shown: RowWindow;
  metrics: RowMetrics;
  columns: number;
  cell: number;
}

/** Prefetches the artwork of the rows the focus is travelling towards. */
export function usePrefetchRows<T>({
  data,
  art,
  focusedRow,
  shown: { start, end },
  metrics,
  columns,
  cell,
}: Readonly<PrefetchRowsArgs<T>>): void {
  const [travel, setTravel] = useState({ row: focusedRow, down: true });
  if (travel.row !== focusedRow) setTravel({ row: focusedRow, down: focusedRow >= travel.row });

  const uris = useMemo(() => {
    if (!art || cell <= 0) return [];
    const found: string[] = [];
    for (const row of aheadRows({ start, end }, travel.down, metrics)) {
      const first = (row - metrics.headerRows) * columns;
      for (const item of data.slice(first, first + columns)) {
        const uri = art(item, cell);
        if (uri) found.push(uri);
      }
    }
    return found;
  }, [art, cell, columns, data, end, metrics, start, travel.down]);

  usePrefetchAhead(uris);
}
