import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChangedFile } from './changes';
import { unscoredFiles } from './coverage';
import type { Duplicate } from './dry';
import { measureDuplicates } from './dry-command';
import { type FileFinding, judgeFileSize, rustCodeLines } from './file-size';
import { MAX_SOURCE_BYTES, readBounded } from './files';
import { outsideRustTests, parseFunctions } from './functions';
import { duplicateFindings, limitFindings, type Measurements } from './gate';
import { failures, type GateResult, renderGate } from './gate-report';
import { changedFiles, checkOutBase, mergeBase } from './git-changes';
import { type Layout, layout } from './layout';
import type { FunctionScore } from './limits';
import { mergeCoverage } from './merged-coverage';
import { root } from './root';
import { parseGateScope } from './scope';
import { comparedSources, isTestSupport, sourceFiles } from './sources';
import { captureTool } from './tool';
import { measuredSources } from './tracked-files';

interface Tree {
  at: Layout;
  root: string;
  coverage: 'lcov' | 'none';
}

interface Judged {
  changes: ChangedFile[];
  unscored: string[];
}

const sourceOf = (tree: string, file: string) => {
  const path = join(tree, file);
  return existsSync(path) ? readBounded(path, MAX_SOURCE_BYTES) : '';
};

async function functionsOf(tree: Tree, files: readonly string[]): Promise<FunctionScore[]> {
  const done = await captureTool(tree.at, 'functions', [tree.root, tree.coverage, ...files]);
  if (done.exitCode !== 0) {
    throw new Error(`functions.py exited ${done.exitCode}: ${done.stderr.trim()}`);
  }
  return outsideRustTests(parseFunctions(done.stdout), (file) => sourceOf(tree.root, file));
}

async function judgedChanges(at: Layout, base: string, lcov: string[]): Promise<Judged> {
  const all = await changedFiles(at.root, base);
  const kept = new Set(
    sourceFiles(all.map((change) => change.file)).filter((file) => !isTestSupport(file)),
  );
  const changes = all.filter((change) => kept.has(change.file));
  const files = changes.map((change) => change.file);
  const sources = await measuredSources(at.root, []);
  const unscored = unscoredFiles(files, sources, mergeCoverage(at, lcov).measured);
  return { changes, unscored };
}

async function measurements(at: Layout, judged: Judged, before: string): Promise<Measurements> {
  const files = judged.changes.map((change) => change.file);
  const scored = files.filter((file) => !judged.unscored.includes(file));
  const modified = judged.changes.filter((change) => !change.added).map((change) => change.file);
  return {
    changes: judged.changes,
    now: [
      ...(await functionsOf({ at, root: at.root, coverage: 'lcov' }, scored)),
      ...(await functionsOf({ at, root: at.root, coverage: 'none' }, judged.unscored)),
    ],
    before: await functionsOf({ at, root: before, coverage: 'none' }, modified),
  };
}

function fileSizes(changes: readonly ChangedFile[], before: string): FileFinding[] {
  return changes
    .filter((change) => change.file.endsWith('.rs'))
    .map((change) =>
      judgeFileSize(
        change.file,
        rustCodeLines(sourceOf(root, change.file)),
        rustCodeLines(sourceOf(before, change.file)),
      ),
    )
    .filter((finding) => finding !== undefined);
}

async function duplicatesAmong(at: Layout, changes: readonly ChangedFile[]): Promise<Duplicate[]> {
  const changed = changes.map((change) => change.file);
  const sources = await measuredSources(at.root, []);
  return (await measureDuplicates(comparedSources(sources, changed))).production;
}

async function measure(at: Layout, base: string, lcov: string[]): Promise<GateResult> {
  const judged = await judgedChanges(at, base, lcov);
  const before = mkdtempSync(join(tmpdir(), 'kroma-quality-base-'));
  try {
    const modified = judged.changes.filter((change) => !change.added).map((change) => change.file);
    await checkOutBase({ root: at.root, base, into: before }, modified);
    const measured = await measurements(at, judged, before);
    return {
      base,
      files: judged.changes.length,
      limits: limitFindings(measured),
      fileSizes: fileSizes(judged.changes, before),
      duplicates: duplicateFindings(await duplicatesAmong(at, judged.changes), measured),
      unscored: judged.unscored,
    };
  } finally {
    rmSync(before, { recursive: true, force: true });
  }
}

export async function main(argv: string[]): Promise<void> {
  const scope = parseGateScope(argv);
  const at = layout(root);
  const result = await measure(at, await mergeBase(at.root, scope.base), scope.lcov);
  const report = renderGate({ ...result, base: scope.base });
  mkdirSync(at.metrics, { recursive: true });
  writeFileSync(join(at.metrics, 'gates.md'), report);
  console.log(report);
  if (failures(result) > 0) {
    throw new Error('the quality gate failed: fix what this change added or made worse');
  }
}
