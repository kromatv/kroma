import { describe, expect, it } from 'vitest';
import { lcovFiles, mergeLcov } from './lcov';

const ROOT = '/repo';

const report = (...lines: string[]) => `${lines.join('\n')}\n`;

describe('mergeLcov', () => {
  it('folds two records of one file into one, keeping the best hit count per line', () => {
    const first = report('SF:/repo/server/src/a.rs', 'DA:1,0', 'DA:2,4', 'end_of_record');
    const second = report(
      'SF:/repo/server/src/a.rs',
      'DA:1,3',
      'DA:2,1',
      'DA:9,0',
      'end_of_record',
    );

    const merged = mergeLcov([first, second], ROOT);

    expect(merged).toBe(
      report('TN:', 'SF:server/src/a.rs', 'DA:1,3', 'DA:2,4', 'DA:9,0', 'end_of_record'),
    );
  });

  it('folds a file one report names twice, as a concatenated cargo report does', () => {
    const twice = report(
      'SF:/repo/server/src/a.rs',
      'DA:1,0',
      'end_of_record',
      'SF:/repo/server/src/a.rs',
      'DA:1,7',
      'end_of_record',
    );

    expect(mergeLcov([twice], ROOT)).toBe(
      report('TN:', 'SF:server/src/a.rs', 'DA:1,7', 'end_of_record'),
    );
  });

  it('treats an absolute and a relative spelling of one file as the same file', () => {
    const absolute = report('SF:/repo/packages/core/src/hevc.ts', 'DA:5,0', 'end_of_record');
    const relative = report('SF:packages/core/src/hevc.ts', 'DA:5,2', 'end_of_record');

    expect(mergeLcov([absolute, relative], ROOT)).toBe(
      report('TN:', 'SF:packages/core/src/hevc.ts', 'DA:5,2', 'end_of_record'),
    );
  });

  it('leaves a path outside the root as it is, and sorts files by path', () => {
    const outside = report('SF:/elsewhere/z.rs', 'DA:1,1', 'end_of_record');
    const inside = report('SF:/repo/b.rs', 'DA:1,1', 'end_of_record');

    expect([...lcovFiles(mergeLcov([inside, outside], ROOT))]).toEqual(['/elsewhere/z.rs', 'b.rs']);
  });

  it('keeps the best count of each branch, reading an untaken dash as zero', () => {
    const first = report('SF:a.ts', 'BRDA:3,0,0,-', 'BRDA:3,0,1,2', 'DA:3,2', 'end_of_record');
    const second = report(
      'SF:a.ts',
      'BRDA:3,0,0,1',
      'BRDA:3,0,1,-',
      'BRDA:1,0,0,0',
      'end_of_record',
    );

    expect(mergeLcov([first, second], ROOT)).toBe(
      report(
        'TN:',
        'SF:a.ts',
        'BRDA:1,0,0,0',
        'BRDA:3,0,0,1',
        'BRDA:3,0,1,2',
        'DA:3,2',
        'end_of_record',
      ),
    );
  });

  it('drops the records crapper does not read and the lines it cannot parse', () => {
    const noisy = report(
      'DA:1,1',
      'TN:suite',
      'SF:a.ts',
      'FN:1,main',
      'FNDA:1,main',
      'DA:x,1',
      'DA:2',
      'BRDA:1',
      'BRDA:1,0',
      'BRDA:1,0,1',
      'BRDA:x,0,0,1',
      'BRDA:2,0,0,y',
      'DA:4,1,checksum',
      'LF:1',
      'LH:1',
      'end_of_record',
      'DA:8,8',
    );

    expect(mergeLcov([noisy], ROOT)).toBe(report('TN:', 'SF:a.ts', 'DA:4,1', 'end_of_record'));
  });

  it('keeps a branch name that holds a comma, and reads Windows line ends', () => {
    const windows = 'SF:a.ts\r\nBRDA:1,0,a,b,3\r\nend_of_record\r\n';

    expect(mergeLcov([windows], ROOT)).toBe(
      report('TN:', 'SF:a.ts', 'BRDA:1,0,a,b,3', 'end_of_record'),
    );
  });

  it('takes a root written with its trailing slash', () => {
    const absolute = report('SF:/repo/a.rs', 'DA:1,1', 'end_of_record');

    expect([...lcovFiles(mergeLcov([absolute], '/repo/'))]).toEqual(['a.rs']);
  });

  it('is empty when there is nothing to merge', () => {
    expect(mergeLcov([], ROOT)).toBe('');
    expect(mergeLcov([''], ROOT)).toBe('');
  });
});

describe('lcovFiles', () => {
  it('lists the files a report holds a record for', () => {
    const text = report(
      'TN:',
      'SF:a.ts',
      'DA:1,1',
      'end_of_record',
      'TN:',
      'SF:b/c.rs',
      'end_of_record',
    );

    expect([...lcovFiles(text)]).toEqual(['a.ts', 'b/c.rs']);
  });
});
