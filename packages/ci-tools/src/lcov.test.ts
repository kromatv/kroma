import { describe, expect, it } from 'vitest';
import { mergeLcov } from './lcov';

const record = (path: string, ...body: string[]) =>
  [`SF:${path}`, ...body, 'end_of_record'].join('\n');

const linesOf = (report: string, path: string) => {
  const start = report.indexOf(`SF:${path}\n`);
  const end = report.indexOf('end_of_record', start);
  return report.slice(start, end).split('\n');
};

describe('merging lcov reports', () => {
  it('keeps a file one report measured as it was', () => {
    const merged = mergeLcov([record('a.rs', 'DA:1,2', 'DA:2,0', 'LF:2', 'LH:1')]);

    expect(linesOf(merged, 'a.rs')).toEqual(
      expect.arrayContaining(['DA:1,2', 'DA:2,0', 'LF:2', 'LH:1']),
    );
  });

  it('counts a file two reports measured once, with the hits of both', () => {
    const first = record('a.rs', 'DA:1,1', 'DA:2,0', 'DA:3,0');
    const second = record('a.rs', 'DA:2,4', 'DA:3,0');

    const merged = mergeLcov([first, second]);

    expect(merged.match(/^SF:a\.rs$/gm)).toHaveLength(1);
    expect(linesOf(merged, 'a.rs')).toEqual(
      expect.arrayContaining(['DA:1,1', 'DA:2,4', 'DA:3,0', 'LF:3', 'LH:2']),
    );
  });

  it('adds the branches and the calls of a function, and leaves a branch never reached as never reached', () => {
    const first = record('a.rs', 'FN:3,run', 'FNDA:0,run', 'BRDA:5,0,0,-', 'BRDA:5,0,1,1');
    const second = record('a.rs', 'FN:3,run', 'FNDA:2,run', 'BRDA:5,0,0,-', 'BRDA:5,0,1,3');

    const lines = linesOf(mergeLcov([first, second]), 'a.rs');

    expect(lines).toEqual(
      expect.arrayContaining(['FN:3,run', 'FNDA:2,run', 'FNH:1', 'BRDA:5,0,0,-', 'BRDA:5,0,1,4']),
    );
    expect(lines).toEqual(expect.arrayContaining(['BRF:2', 'BRH:1']));
  });

  it('keeps every file of every report, each closed', () => {
    const merged = mergeLcov([record('b.rs', 'DA:1,1'), record('a.rs', 'DA:1,0')]);

    expect(merged.match(/^SF:/gm)).toHaveLength(2);
    expect(merged.match(/^end_of_record$/gm)).toHaveLength(2);
  });
});
