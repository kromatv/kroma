import { describe, expect, it } from 'vitest';
import {
  clusterDuplicates,
  type Duplicate,
  duplicateRows,
  parseDrySnapshot,
  type Span,
  splitDuplicates,
  summarizeDry,
} from './dry';

const span = (file: string, start: number, end: number): Span => ({ file, start, end });

const pair = (score: number, left: Span, right: Span): Duplicate => ({
  score,
  language: 'rust',
  left,
  right,
});

const A = span('a.rs', 1, 10);
const B = span('b.rs', 1, 10);
const C = span('c.rs', 5, 8);
const D = span('d.rs', 1, 40);
const E = span('d.rs', 50, 89);

describe('parseDrySnapshot', () => {
  it('reads the candidates dryer writes', () => {
    const edn = [
      '{:candidates [',
      ' {:score 0.890909090909',
      '  :language "rust"',
      '  :left {:file "modules/lib/naming/src/casing.rs", :start-line 20, :end-line 26}',
      '  :right {:file "server/crates/kroma-domain/src/reports.rs", :start-line 24, :end-line 30}',
      '  :left-nodes 67',
      '  :right-nodes 67}]}',
    ].join('\n');

    expect(parseDrySnapshot(edn)).toEqual([
      {
        score: 0.890909090909,
        language: 'rust',
        left: { file: 'modules/lib/naming/src/casing.rs', start: 20, end: 26 },
        right: { file: 'server/crates/kroma-domain/src/reports.rs', start: 24, end: 30 },
      },
    ]);
  });

  it('reads a run that found nothing, and rejects another shape', () => {
    expect(parseDrySnapshot('{:candidates []}')).toEqual([]);
    expect(() => parseDrySnapshot('{:entries []}')).toThrow();
  });
});

describe('splitDuplicates', () => {
  it('calls a pair test code as soon as either side is', () => {
    const pairs = [pair(1, A, B), pair(0.9, A, C), pair(0.85, C, B)];

    const split = splitDuplicates(pairs, (side) => side.file === 'c.rs');

    expect(split.production).toEqual([pair(1, A, B)]);
    expect(split.test).toEqual([pair(0.9, A, C), pair(0.85, C, B)]);
  });
});

describe('clusterDuplicates', () => {
  it('joins the forms a chain of pairs links, the largest group first', () => {
    const clusters = clusterDuplicates([pair(1, D, E), pair(0.9, A, B), pair(0.9, B, C)]);

    expect(clusters).toEqual([
      { forms: [A, B, C], lines: 24 },
      { forms: [D, E], lines: 80 },
    ]);
  });

  it('counts a form once however many pairs name it, and takes a self pair', () => {
    const clusters = clusterDuplicates([pair(1, A, B), pair(1, B, A), pair(1, A, A)]);

    expect(clusters).toEqual([{ forms: [A, B], lines: 20 }]);
  });

  it('puts the group with more lines first when two have as many forms', () => {
    const clusters = clusterDuplicates([pair(1, A, B), pair(1, D, E)]);

    expect(clusters.map((cluster) => cluster.lines)).toEqual([80, 20]);
  });
});

describe('duplicateRows', () => {
  it('writes one tab-separated pair per line, closest first', () => {
    const rows = duplicateRows([pair(0.8234, B, C), pair(1, A, B), pair(1, A, C)]);

    expect(rows).toBe(
      [
        '1.00\trust\ta.rs:1-10\tb.rs:1-10',
        '1.00\trust\ta.rs:1-10\tc.rs:5-8',
        '0.82\trust\tb.rs:1-10\tc.rs:5-8',
        '',
      ].join('\n'),
    );
  });

  it('orders two pairs of one score by their left span', () => {
    const rows = duplicateRows([pair(1, B, C), pair(1, A, C)]);

    expect(rows.split('\n').map((row) => row.split('\t')[2])).toEqual([
      'a.rs:1-10',
      'b.rs:1-10',
      undefined,
    ]);
  });

  it('is empty for no pair', () => {
    expect(duplicateRows([])).toBe('');
  });
});

describe('summarizeDry', () => {
  it('counts production pairs and ranks the ones that would fold the most lines', () => {
    const split = {
      production: [pair(1, A, B), pair(0.85, D, E), pair(0.9999, B, C)],
      test: [pair(1, A, C)],
    };

    const summary = summarizeDry(split, 2);

    expect(summary).toMatchObject({
      production: 3,
      test: 1,
      exact: 2,
      crossFile: 2,
      clusters: 2,
    });
    expect(summary.largestPairs).toEqual([pair(0.85, D, E), pair(1, A, B)]);
    expect(summary.largestClusters.map((cluster) => cluster.forms.length)).toEqual([3, 2]);
  });

  it('orders two pairs of one weight by their left span', () => {
    const split = { production: [pair(1, B, C), pair(1, A, C)], test: [] };

    expect(summarizeDry(split, 5).largestPairs).toEqual([pair(1, A, C), pair(1, B, C)]);
  });
});
