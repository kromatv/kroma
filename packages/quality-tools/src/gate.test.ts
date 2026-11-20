import { describe, expect, it } from 'vitest';
import type { ChangedFile } from './changes';
import type { Duplicate } from './dry';
import { duplicateFindings, limitFindings, type Measurements } from './gate';
import type { FunctionScore } from './functions';

const fn = (name: string, start: number, over: Partial<FunctionScore> = {}): FunctionScore => ({
  file: 'server/src/a.rs',
  name,
  start,
  end: start + 9,
  lines: 10,
  complexity: 2,
  crap: 2,
  parameters: 1,
  nesting: 1,
  ...over,
});

const modified = (start: number, end: number, file = 'server/src/a.rs'): ChangedFile => ({
  file,
  added: false,
  lines: [{ start, end }],
});

const pair = (leftStart: number, right: string): Duplicate => ({
  score: 0.9,
  language: 'rust',
  left: { file: 'server/src/a.rs', start: leftStart, end: leftStart + 9 },
  right: { file: right, start: 1, end: 10 },
});

describe('limitFindings', () => {
  it('judges only the functions a changed line is inside', () => {
    const measured: Measurements = {
      changes: [modified(25, 26)],
      now: [fn('untouched', 1, { lines: 90 }), fn('touched', 20, { lines: 90 })],
      before: [],
    };

    const findings = limitFindings(measured);

    expect(findings.map((finding) => finding.function.name)).toEqual(['touched']);
  });

  it('compares a function against its namesake in the base version of the same file', () => {
    const measured: Measurements = {
      changes: [modified(20, 21)],
      now: [fn('touched', 20, { lines: 90 })],
      before: [
        fn('touched', 18, { lines: 90 }),
        fn('touched', 1, { file: 'server/src/other.rs', lines: 10 }),
      ],
    };

    const [finding] = limitFindings(measured);

    expect(finding?.inherited).toBe(true);
  });

  it('skips a changed file in a language it does not measure', () => {
    const measured: Measurements = {
      changes: [modified(1, 5, 'docs/ci.md')],
      now: [fn('touched', 1, { file: 'docs/ci.md', lines: 90 })],
      before: [],
    };

    expect(limitFindings(measured)).toEqual([]);
  });
});

describe('duplicateFindings', () => {
  it('leaves out a pair the change did not touch', () => {
    const measured: Measurements = { changes: [modified(500, 501)], now: [], before: [] };

    expect(duplicateFindings([pair(20, 'server/src/b.rs')], measured)).toEqual([]);
  });

  it('fails a pair with a function the base did not hold', () => {
    const measured: Measurements = {
      changes: [modified(20, 29)],
      now: [fn('copied', 20)],
      before: [fn('other', 1)],
    };

    const [finding] = duplicateFindings([pair(20, 'server/src/b.rs')], measured);

    expect(finding?.inherited).toBe(false);
  });

  it('reports a pair as inherited when the touched side was a function of the base', () => {
    const measured: Measurements = {
      changes: [modified(22, 23)],
      now: [fn('older', 20)],
      before: [fn('older', 18)],
    };

    const [finding] = duplicateFindings([pair(20, 'server/src/b.rs')], measured);

    expect(finding?.inherited).toBe(true);
  });

  it('fails a pair with a side in a file the change adds', () => {
    const added: ChangedFile = {
      file: 'server/src/b.rs',
      added: true,
      lines: [{ start: 1, end: 400 }],
    };

    const [finding] = duplicateFindings([pair(20, 'server/src/b.rs')], {
      changes: [added],
      now: [],
      before: [],
    });

    expect(finding?.inherited).toBe(false);
  });
});
