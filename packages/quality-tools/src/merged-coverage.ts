import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { type Measured, measuredBy } from './coverage';
import { MAX_LCOV_BYTES, readBounded } from './files';
import type { Layout } from './layout';
import { lcovFiles, mergeLcov } from './lcov';

const DEFAULT_REPORTS = ['coverage/lcov.info', 'server/lcov.info'];

export interface MergedCoverage {
  reports: string[];
  measured: Measured;
}

function shown(at: Layout, path: string): string {
  const inside = relative(at.root, path);
  return inside.startsWith('..') ? path : inside;
}

function reportsToRead(at: Layout, extra: readonly string[]): string[] {
  const named = extra.map((path) => resolve(path));
  const missing = named.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`no lcov report at ${missing.join(', ')}`);
  }
  const found = DEFAULT_REPORTS.map((path) => join(at.root, path)).filter((path) =>
    existsSync(path),
  );
  return [...new Set([...found, ...named])];
}

/**
 * Folds the default lcov reports that exist, and every `extra` one, into the
 * one file crapper and mutator read. crapper keeps the last record it meets
 * for a file, so a file measured by two runs has to arrive as one record.
 */
export function mergeCoverage(at: Layout, extra: readonly string[]): MergedCoverage {
  const reports = reportsToRead(at, extra);
  rmSync(at.mergedLcov, { force: true });
  if (reports.length === 0) {
    return { reports: [], measured: measuredBy(new Set()) };
  }
  const merged = mergeLcov(
    reports.map((path) => readBounded(path, MAX_LCOV_BYTES)),
    at.root,
  );
  mkdirSync(dirname(at.mergedLcov), { recursive: true });
  writeFileSync(at.mergedLcov, merged);
  return {
    reports: reports.map((path) => shown(at, path)),
    measured: measuredBy(lcovFiles(merged)),
  };
}
