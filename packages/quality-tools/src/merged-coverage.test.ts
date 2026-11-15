import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Layout, layout } from './layout';
import { mergeCoverage } from './merged-coverage';

const record = (file: string, hits: number) => `SF:${file}\nDA:1,${hits}\nend_of_record\n`;

describe('mergeCoverage', () => {
  let at: Layout;

  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(at.root, path)), { recursive: true });
    writeFileSync(join(at.root, path), text);
  };

  beforeEach(() => {
    at = layout(mkdtempSync(join(tmpdir(), 'quality-coverage-')));
  });

  afterEach(() => {
    rmSync(at.root, { recursive: true, force: true });
  });

  it('folds the TypeScript and the Rust report into the one file the tools read', () => {
    write('coverage/lcov.info', record('packages/core/src/hevc.ts', 2));
    write('server/lcov.info', record(join(at.root, 'server/src/main.rs'), 5));

    const coverage = mergeCoverage(at, []);

    expect(coverage.reports).toEqual(['coverage/lcov.info', 'server/lcov.info']);
    expect(coverage.measured('packages/core/src/hevc.ts')).toBe(true);
    expect(coverage.measured('server/src/main.rs')).toBe(true);
    expect(coverage.measured('server/src/lib.rs')).toBe(false);
    expect(readFileSync(at.mergedLcov, 'utf8')).toContain('SF:server/src/main.rs\nDA:1,5');
  });

  it('adds a report named by the caller, and keeps the best count of a file both hold', () => {
    write('server/lcov.info', record('server/src/main.rs', 0));
    write('kept/modules.info', record('server/src/main.rs', 3));

    const coverage = mergeCoverage(at, [join(at.root, 'kept/modules.info')]);

    expect(coverage.reports).toEqual(['server/lcov.info', 'kept/modules.info']);
    expect(readFileSync(at.mergedLcov, 'utf8')).toContain('DA:1,3');
  });

  it('names a report outside the repository by its whole path', () => {
    const outside = mkdtempSync(join(tmpdir(), 'quality-artifact-'));
    writeFileSync(join(outside, 'rust.info'), record('/ci/server/src/main.rs', 1));

    const coverage = mergeCoverage(at, [join(outside, 'rust.info')]);
    rmSync(outside, { recursive: true, force: true });

    expect(coverage.reports).toEqual([join(outside, 'rust.info')]);
    expect(coverage.measured('server/src/main.rs')).toBe(true);
  });

  it('reads a default report once when the caller names it too', () => {
    write('coverage/lcov.info', record('a.ts', 1));

    expect(mergeCoverage(at, [join(at.root, 'coverage/lcov.info')]).reports).toEqual([
      'coverage/lcov.info',
    ]);
  });

  it('refuses a named report that is not there', () => {
    expect(() => mergeCoverage(at, [join(at.root, 'typo.info')])).toThrow(/no lcov report at/);
  });

  it('leaves no merged file behind when there is no report, so an old one is never read', () => {
    write('coverage/lcov.info', record('a.ts', 1));
    mergeCoverage(at, []);
    rmSync(join(at.root, 'coverage/lcov.info'));

    const coverage = mergeCoverage(at, []);

    expect(coverage.reports).toEqual([]);
    expect(coverage.measured('a.ts')).toBe(false);
    expect(existsSync(at.mergedLcov)).toBe(false);
  });
});
