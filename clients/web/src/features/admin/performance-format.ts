import type { PerfScopeRow, PerfSegmentRow } from '@kromatv/client/performance';
import type { SortColumn } from '@kromatv/ui/kit';

type Read<T> = (row: T) => number | string;

/** A duration as a reader takes it in: `0.42 ms`, `12.3 ms`, `845 ms`, `1.24 s`. */
export function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  if (ms >= 100) {
    return `${Math.round(ms)} ms`;
  }
  return ms >= 1 ? `${ms.toFixed(1)} ms` : `${ms.toFixed(2)} ms`;
}

/** `rows` in the order `sort` names, first key first; a column `read` does not
 *  know leaves the order alone. */
export function sortRows<T>(
  rows: readonly T[],
  sort: readonly SortColumn[],
  read: Readonly<Record<string, Read<T>>>,
): T[] {
  return [...rows].sort((a, b) => {
    for (const { column, direction } of sort) {
      const value = read[column];
      const order = value ? compare(value(a), value(b)) : 0;
      if (order !== 0) {
        return direction === 'desc' ? -order : order;
      }
    }
    return 0;
  });
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

/** The columns a route or job sorts by. */
export const SCOPE_SORT: Readonly<Record<string, Read<PerfScopeRow>>> = {
  name: (row) => row.name,
  count: (row) => row.count,
  total: (row) => row.totalMs,
  p50: (row) => row.p50Ms,
  p95: (row) => row.p95Ms,
  max: (row) => row.maxMs,
  sql: (row) => row.kinds.sql?.perCall ?? 0,
};

/** The columns a statement, span or call sorts by. */
export const SEGMENT_SORT: Readonly<Record<string, Read<PerfSegmentRow>>> = {
  label: (row) => row.label,
  count: (row) => row.count,
  total: (row) => row.totalMs,
  p95: (row) => row.p95Ms,
  max: (row) => row.maxMs,
  rows: (row) => row.rowsPerCall,
};

/** SQL statements on one tab, everything else (spans, measured calls) on the other. */
export function segmentsOf(
  rows: readonly PerfSegmentRow[],
  tab: 'statements' | 'functions',
): PerfSegmentRow[] {
  return rows.filter((row) => (row.kind === 'sql') === (tab === 'statements'));
}

const LABEL_CHARS = 72;

/** The start of a long label, for a table cell: a statement can run to
 *  thousands of characters on one line, and its drawer shows it whole. */
export function shortLabel(label: string): string {
  return label.length > LABEL_CHARS ? `${label.slice(0, LABEL_CHARS)}…` : label;
}

/** How a route or job is named in the URL that opens its drawer. */
export function scopeId(row: Pick<PerfScopeRow, 'kind' | 'name'>): string {
  return `${row.kind}:${row.name}`;
}
