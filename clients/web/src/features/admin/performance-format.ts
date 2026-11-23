import type {
  PerfFlag,
  PerfScopeRow,
  PerfSegmentRow,
  PerfSlowRequest,
} from '@kromatv/client/performance';
import type { MessageKey, Translate } from '@kromatv/i18n';
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

type Show<T> = (row: T) => string;

/** A row's figures for its table, as `[column, text]` in the order `shown`
 *  lists them. */
export function figuresOf<T>(row: T, shown: Readonly<Record<string, Show<T>>>): [string, string][] {
  return Object.entries(shown).map(([column, show]) => [column, show(row)]);
}

function times(count: number | undefined): string {
  return count === undefined ? '-' : `${count}×`;
}

/** The figures a route or job row shows after its name. */
export const SCOPE_FIGURES: Readonly<Record<string, Show<PerfScopeRow>>> = {
  count: (row) => String(row.count),
  total: (row) => formatMs(row.totalMs),
  p50: (row) => formatMs(row.p50Ms),
  p95: (row) => formatMs(row.p95Ms),
  max: (row) => formatMs(row.maxMs),
  sql: (row) => (row.kinds.sql?.perCall ?? 0).toFixed(1),
  repeat: (row) => times(row.worstRepeat?.count),
};

/** The figures a statement, span or call row shows after its label. */
export const SEGMENT_FIGURES: Readonly<Record<string, Show<PerfSegmentRow>>> = {
  count: (row) => String(row.count),
  total: (row) => formatMs(row.totalMs),
  p95: (row) => formatMs(row.p95Ms),
  max: (row) => formatMs(row.maxMs),
  rows: (row) => row.rowsPerCall.toFixed(1),
};

function sqlSpent(row: PerfSlowRequest): string {
  const sql = row.kinds.sql;
  return sql ? `${sql.count} · ${formatMs(sql.ms)}` : '-';
}

/** The figures a slow request row shows after its time and name. */
export const SLOW_FIGURES: Readonly<Record<string, Show<PerfSlowRequest>>> = {
  status: (row) => (row.status === null ? '-' : String(row.status)),
  total: (row) => formatMs(row.totalMs),
  sql: sqlSpent,
  repeat: (row) => times(row.repeats[0]?.count),
};

/** The columns a slow request sorts by. */
export const SLOW_SORT: Readonly<Record<string, Read<PerfSlowRequest>>> = {
  at: (row) => row.atMs,
  name: (row) => row.name,
  total: (row) => row.totalMs,
  sql: (row) => row.kinds.sql?.ms ?? 0,
};

const KIND_LABEL: Readonly<Record<string, MessageKey>> = {
  sql: 'perf.kindSql',
  span: 'perf.kindSpan',
  http: 'perf.kindHttp',
};

/** How a kind of segment is named; one the page does not know reads as its own
 *  word. */
export function kindLabel(kind: string, t: Translate): string {
  const key = KIND_LABEL[kind];
  return key ? t(key) : kind;
}

type Tone = 'danger' | 'warning' | 'info' | 'neutral';

const FLAGS: Readonly<Record<string, { labelKey: MessageKey; tone: Tone }>> = {
  n_plus_one: { labelKey: 'perf.flagNPlusOne', tone: 'danger' },
  server_errors: { labelKey: 'perf.flagServerErrors', tone: 'danger' },
  full_scan: { labelKey: 'perf.flagFullScan', tone: 'danger' },
  auto_index: { labelKey: 'perf.flagAutoIndex', tone: 'danger' },
  slow_p95: { labelKey: 'perf.flagSlowP95', tone: 'warning' },
  cold_outlier: { labelKey: 'perf.flagColdOutlier', tone: 'warning' },
  temp_sort: { labelKey: 'perf.flagTempSort', tone: 'warning' },
  large_response: { labelKey: 'perf.flagLargeResponse', tone: 'info' },
};

/** How a flag is drawn: its words and its tone. A flag a newer server adds
 *  reads as its own name, in a neutral tone. */
export function flagLook(flag: PerfFlag, t: Translate): { label: string; tone: Tone } {
  const known = FLAGS[flag];
  return known ? { label: t(known.labelKey), tone: known.tone } : { label: flag, tone: 'neutral' };
}

/** Whether the server can show a segment's query plan: a statement of the core
 *  database. */
export function hasPlan(row: Pick<PerfSegmentRow, 'kind' | 'origin'>): boolean {
  return row.kind === 'sql' && row.origin === 'core';
}
