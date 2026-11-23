import type { PerfScopeRow, PerfSlowRequest } from '@kromatv/client/performance';
import type { Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import {
  figuresOf,
  flagLook,
  formatMs,
  hasPlan,
  kindLabel,
  SCOPE_FIGURES,
  segmentsOf,
  shortLabel,
  SLOW_FIGURES,
  sortRows,
} from './performance-format';

const rows = [
  { name: 'b', total: 5, calls: 1 },
  { name: 'a', total: 20, calls: 1 },
  { name: 'c', total: 5, calls: 9 },
];

const read = {
  name: (row: (typeof rows)[number]) => row.name,
  total: (row: (typeof rows)[number]) => row.total,
  calls: (row: (typeof rows)[number]) => row.calls,
};

function segment(kind: string) {
  return {
    kind,
    key: kind,
    label: '',
    origin: null,
    count: 0,
    totalMs: 0,
    meanMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    maxMs: 0,
    rowsPerCall: 0,
    fullScanStepsPerCall: 0,
    sorts: 0,
    autoIndexes: 0,
    callers: [],
    flags: [],
  };
}

const spread = { count: 3, totalMs: 30, meanMs: 10, p50Ms: 9, p95Ms: 14, p99Ms: 15, maxMs: 16 };

const scope: PerfScopeRow = {
  kind: 'request',
  name: 'GET /api/home',
  ...spread,
  serverErrors: 0,
  clientErrors: 0,
  segmentsPerCall: 4,
  kinds: { sql: { perCall: 4, msPerCall: 2 } },
  maxSegments: 4,
  worstRepeat: null,
  bytesPerCall: null,
  parts: [],
  flags: [],
};

const slow: PerfSlowRequest = {
  id: '7',
  atMs: 0,
  name: 'GET /api/home',
  status: null,
  totalMs: 1240,
  kinds: {},
  segments: 0,
  bytes: null,
  repeats: [{ key: '1', kind: 'sql', label: 'SELECT 1', origin: 'core', count: 24 }],
  droppedSteps: 0,
  waterfall: [],
};

const t: Translate = (key: string, _vars?: unknown) => `[${key}]`;

describe('formatMs', () => {
  it.each([
    [0.4213, '0.42 ms'],
    [12.34, '12.3 ms'],
    [845.6, '846 ms'],
    [1240, '1.24 s'],
  ])('reads %s as %s', (ms, shown) => {
    expect(formatMs(ms)).toBe(shown);
  });
});

describe('sortRows', () => {
  it('sorts by the first key, then breaks ties with the next', () => {
    const sorted = sortRows(
      rows,
      [
        { column: 'total', direction: 'desc' },
        { column: 'calls', direction: 'desc' },
      ],
      read,
    );

    expect(sorted.map((row) => row.name)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order alone for a column it cannot read', () => {
    const sorted = sortRows(rows, [{ column: 'unknown', direction: 'asc' }], read);

    expect(sorted.map((row) => row.name)).toEqual(['b', 'a', 'c']);
  });
});

describe('segmentsOf', () => {
  it('splits statements from every other kind', () => {
    const segments = [segment('sql'), segment('span'), segment('http')];

    expect(segmentsOf(segments, 'statements').map((s) => s.kind)).toEqual(['sql']);
    expect(segmentsOf(segments, 'functions').map((s) => s.kind)).toEqual(['span', 'http']);
  });
});

describe('shortLabel', () => {
  it('keeps a short label whole and cuts a long one with a marker', () => {
    expect(shortLabel('SELECT 1')).toBe('SELECT 1');
    expect(shortLabel('x'.repeat(400))).toBe(`${'x'.repeat(72)}…`);
  });
});

describe('figuresOf', () => {
  it('shows a route with no repeat as a dash', () => {
    expect(figuresOf(scope, SCOPE_FIGURES)).toEqual([
      ['count', '3'],
      ['total', '30.0 ms'],
      ['p50', '9.0 ms'],
      ['p95', '14.0 ms'],
      ['max', '16.0 ms'],
      ['sql', '4.0'],
      ['repeat', '-'],
    ]);
  });

  it('shows a slow request with no status and no statement as dashes', () => {
    expect(figuresOf(slow, SLOW_FIGURES)).toEqual([
      ['status', '-'],
      ['total', '1.24 s'],
      ['sql', '-'],
      ['repeat', '24×'],
    ]);
  });

  it('shows what a slow request spent in SQL', () => {
    const request = { ...slow, status: 200, kinds: { sql: { count: 20, ms: 41 } }, repeats: [] };

    expect(figuresOf(request, SLOW_FIGURES)).toEqual([
      ['status', '200'],
      ['total', '1.24 s'],
      ['sql', '20 · 41.0 ms'],
      ['repeat', '-'],
    ]);
  });
});

describe('kindLabel', () => {
  it('names a kind it knows and keeps the word of one it does not', () => {
    expect(kindLabel('http', t)).toBe('[perf.kindHttp]');
    expect(kindLabel('cache', t)).toBe('cache');
  });
});

describe('flagLook', () => {
  it('draws a known flag in its tone and a new one in a neutral tone', () => {
    expect(flagLook('n_plus_one', t)).toEqual({ label: '[perf.flagNPlusOne]', tone: 'danger' });
    expect(flagLook('lock_wait', t)).toEqual({ label: 'lock_wait', tone: 'neutral' });
  });
});

describe('hasPlan', () => {
  it('plans a statement of the core database only', () => {
    expect(hasPlan({ kind: 'sql', origin: 'core' })).toBe(true);
    expect(hasPlan({ kind: 'sql', origin: 'tv.kroma.acquisition' })).toBe(false);
    expect(hasPlan({ kind: 'span', origin: 'core' })).toBe(false);
  });
});
