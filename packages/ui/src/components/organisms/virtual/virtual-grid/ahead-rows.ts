import type { RowMetrics, RowWindow } from './grid-rows';

/** Rows of tiles past the mounted window in the direction of travel, nearest
 *  first: one page plus a row, never a header. */
export function aheadRows(shown: RowWindow, down: boolean, metrics: RowMetrics): number[] {
  const budget = metrics.visible + 1;
  const rows: number[] = [];
  for (let step = 1; step <= budget; step += 1) {
    const row = down ? shown.end + step : shown.start - step;
    if (row < metrics.headerRows || row >= metrics.count) break;
    rows.push(row);
  }
  return rows;
}
