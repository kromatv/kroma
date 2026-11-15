import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type DryReport,
  duplicateRows,
  parseDrySnapshot,
  type Span,
  splitDuplicates,
  summarizeDry,
} from './dry';
import { MAX_SNAPSHOT_BYTES, MAX_SOURCE_BYTES, readBounded } from './files';
import { type Layout, layout } from './layout';
import { root } from './root';
import { type LineSpan, rustTestSpans } from './rust-test-spans';
import { parseScope, type Scope } from './scope';
import { isTestSupport } from './sources';
import { renderDry } from './summary';
import { captureTool } from './tool';
import { measuredSources } from './tracked-files';

const THRESHOLD = 0.8;
const LARGEST = 15;

function testCode(at: Layout): (span: Span) => boolean {
  const read = new Map<string, LineSpan[]>();
  const inlineTests = (file: string) => {
    const known = read.get(file);
    if (known !== undefined) {
      return known;
    }
    const spans = file.endsWith('.rs')
      ? rustTestSpans(readBounded(join(at.root, file), MAX_SOURCE_BYTES))
      : [];
    read.set(file, spans);
    return spans;
  };
  return (span) =>
    isTestSupport(span.file) ||
    inlineTests(span.file).some((test) => span.start >= test.start && span.end <= test.end);
}

/** Compares every measured source file under the scope and writes the pairs, production apart from test, into `.metrics`. */
export async function runDry(scope: Scope): Promise<DryReport> {
  const at = layout(root);
  const sources = await measuredSources(at.root, scope.paths);
  mkdirSync(at.metrics, { recursive: true });
  const done = await captureTool(at, 'dryer', [
    '--edn',
    '--threshold',
    String(THRESHOLD),
    ...sources,
  ]);
  if (done.exitCode !== 0) {
    throw new Error(`dryer exited ${done.exitCode}: ${done.stderr.trim()}`);
  }
  const pairs = parseDrySnapshot(readBounded(join(at.metrics, 'dry.edn'), MAX_SNAPSHOT_BYTES));
  const split = splitDuplicates(pairs, testCode(at));
  writeFileSync(join(at.metrics, 'dry-production.tsv'), duplicateRows(split.production));
  writeFileSync(join(at.metrics, 'dry-test.tsv'), duplicateRows(split.test));
  return { threshold: THRESHOLD, summary: summarizeDry(split, LARGEST) };
}

export async function main(argv: string[]): Promise<void> {
  console.log(renderDry(await runDry(parseScope(argv))));
}
