import { describe, expect, it } from 'vitest';
import { formatMs, scopeId, segmentsOf, sortRows } from './performance-format';

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
    vmStepsPerCall: 0,
    sorts: 0,
    autoIndexes: 0,
    callers: [],
    flags: [],
  };
}

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

describe('scopeId', () => {
  it('names a route by its kind and its template', () => {
    expect(scopeId({ kind: 'request', name: 'GET /api/shows/{id}' })).toBe(
      'request:GET /api/shows/{id}',
    );
  });
});
