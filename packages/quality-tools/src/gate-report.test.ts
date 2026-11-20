import { describe, expect, it } from 'vitest';
import { failures, type GateResult, renderGate } from './gate-report';
import type { Finding } from './limits';

const added: Finding = {
  function: {
    file: 'server/src/a.rs',
    name: 'walk',
    start: 12,
    end: 80,
    lines: 60,
    complexity: 4,
    crap: 4,
  },
  measure: 'lines',
  value: 60,
  limit: 30,
  inherited: false,
};

const inherited: Finding = { ...added, inherited: true };

const result = (over: Partial<GateResult> = {}): GateResult => ({
  base: 'origin/main',
  files: 2,
  limits: [],
  fileSizes: [],
  duplicates: [],
  unscored: [],
  ...over,
});

describe('renderGate', () => {
  it('passes a change with no finding', () => {
    const clean = result();

    expect(failures(clean)).toBe(0);
    expect(renderGate(clean)).toContain('Passed: 2 changed source file(s) against `origin/main`.');
  });

  it('fails on what the change added, and names the place, the value and the fix', () => {
    const failed = result({
      limits: [added],
      fileSizes: [{ file: 'server/src/b.rs', lines: 340, limit: 300, inherited: false }],
      duplicates: [
        {
          inherited: false,
          pair: {
            score: 0.875,
            language: 'rust',
            left: { file: 'server/src/a.rs', start: 1, end: 9 },
            right: { file: 'server/src/c.rs', start: 4, end: 12 },
          },
        },
      ],
    });

    const report = renderGate(failed);

    expect(failures(failed)).toBe(3);
    expect(report).toContain('Failed: 3 finding(s)');
    expect(report).toContain(
      '- `server/src/a.rs:12` `walk`: lines 60, limit 30 (extract a named function)',
    );
    expect(report).toContain('- `server/src/b.rs`: 340 lines of code, limit 300 (split at a seam)');
    expect(report).toContain(
      '- 0.88 `server/src/a.rs:1-9` and `server/src/c.rs:4-12` (extract the shared code)',
    );
  });

  it('lists an inherited finding apart, and does not fail on it', () => {
    const touched = result({ limits: [inherited] });

    const report = renderGate(touched);

    expect(failures(touched)).toBe(0);
    expect(report).toContain('### Touched, and still over a limit from before');
    expect(report).not.toContain('### Added or made worse by this change');
  });

  it('names the files whose CRAP no coverage report could score', () => {
    const report = renderGate(result({ unscored: ['clients/desktop/src-tauri/src/main.rs'] }));

    expect(report).toContain('- `clients/desktop/src-tauri/src/main.rs`');
  });
});
