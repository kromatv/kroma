import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unmeasuredAreas } from './coverage';
import { type CrapReport, type LanguageCrap, parseCrapSnapshot, summarizeCrap } from './crap';
import { MAX_SNAPSHOT_BYTES, readBounded } from './files';
import { type Layout, layout } from './layout';
import { type MergedCoverage, mergeCoverage } from './merged-coverage';
import { root } from './root';
import { parseScope, type Scope } from './scope';
import { type Language, languageOf } from './sources';
import { renderCrap } from './summary';
import { captureTool } from './tool';
import { measuredSources } from './tracked-files';

const WORST = 15;

interface Measurement {
  at: Layout;
  sources: string[];
  coverage: MergedCoverage;
}

async function measure(language: Language, run: Measurement): Promise<LanguageCrap | undefined> {
  const table = join(run.at.metrics, `crap-${language}.txt`);
  const snapshot = join(run.at.metrics, `crap-${language}.edn`);
  rmSync(table, { force: true });
  rmSync(snapshot, { force: true });
  const files = run.sources.filter((file) => languageOf(file) === language);
  if (files.length === 0) {
    return undefined;
  }
  const scored = files.some(run.coverage.measured);
  const coverage = scored ? '--use-existing-coverage' : '--no-coverage';
  const done = await captureTool(run.at, 'crapper', [coverage, ...files]);
  if (done.exitCode !== 0) {
    throw new Error(`crapper exited ${done.exitCode} on ${language}: ${done.stderr.trim()}`);
  }
  writeFileSync(table, done.stdout);
  renameSync(join(run.at.metrics, 'crap.edn'), snapshot);
  const entries = parseCrapSnapshot(readBounded(snapshot, MAX_SNAPSHOT_BYTES));
  return { language, scored, summary: summarizeCrap(entries, WORST) };
}

/** Scores every measured source file under the scope, one crapper run per language, into `.metrics/crap-<language>`. */
export async function runCrap(scope: Scope): Promise<CrapReport> {
  const at = layout(root);
  const sources = await measuredSources(at.root, scope.paths);
  const coverage = mergeCoverage(at, scope.lcov);
  mkdirSync(at.metrics, { recursive: true });
  const typescript = await measure('typescript', { at, sources, coverage });
  const rust = await measure('rust', { at, sources, coverage });
  return {
    languages: [typescript, rust].filter((language) => language !== undefined),
    unmeasured: unmeasuredAreas(sources, coverage.measured),
    coverageReports: coverage.reports,
  };
}

export async function main(argv: string[]): Promise<void> {
  console.log(renderCrap(await runCrap(parseScope(argv))));
}
