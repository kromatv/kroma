import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { summary } from './actions';
import { root } from './root';
import { blobName, expectedBlobs, newestAttempts, parseShard } from './shard';

const REPORTS = join(root, '.vitest-reports');
const ATTEMPTS = join(root, '.vitest-attempts');
const LCOV = join(root, 'coverage/lcov.info');
const vitest = join(root, 'node_modules/.bin/vitest');

const COVERAGE = ['--coverage', '--coverage.reporter=lcov', '--coverage.reporter=text-summary'];
const SHARD_TIMEOUT = ['--testTimeout=15000'];

// The audit project compiles with the React Compiler, so it instruments the
// same sources a second time and its branch map carries the compiler's
// memo-cache guards. Merged in, those count as uncovered conditions on lines
// that hold no conditional, which caps every hooked kit file below what a test
// of its source can reach. Coverage is measured over the two resolution
// projects; the audit runs on its own.
const MEASURED = ['--project', 'web', '--project', 'native'];

async function codegen(): Promise<void> {
  await $`bun run test:codegen`.cwd(root);
}

async function shard(spec: string): Promise<void> {
  const { index, total } = parseShard(spec);
  await codegen();
  const blob = `--outputFile.blob=${join(REPORTS, blobName({ index, total }))}`;
  await $`${vitest} run --reporter=default --reporter=blob ${blob} --shard=${index}/${total} ${MEASURED} ${COVERAGE} ${SHARD_TIMEOUT}`.cwd(
    root,
  );
}

async function audit(): Promise<void> {
  await codegen();
  await $`${vitest} run --project audit`.cwd(root);
}

function gatherAttempts(): void {
  if (!existsSync(ATTEMPTS)) return;
  mkdirSync(REPORTS, { recursive: true });
  for (const artifact of newestAttempts(readdirSync(ATTEMPTS))) {
    cpSync(join(ATTEMPTS, artifact), REPORTS, { recursive: true });
  }
}

async function merge(total: number | undefined): Promise<void> {
  gatherAttempts();
  if (total !== undefined) {
    const missing = expectedBlobs(total).filter((name) => !existsSync(join(REPORTS, name)));
    if (missing.length > 0) throw new Error(`missing shard report(s): ${missing.join(', ')}`);
  }
  await codegen();
  const run = await $`${vitest} run --merge-reports=${REPORTS} ${COVERAGE}`.cwd(root).nothrow();
  const out = run.stdout.toString();
  if (run.exitCode !== 0) throw new Error(`vitest --merge-reports exited ${run.exitCode}`);
  if (!existsSync(LCOV)) throw new Error(`merge wrote no ${LCOV}`);

  const files = readFileSync(LCOV, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('SF:')).length;
  const table = out
    .split('\n')
    .filter((line) => /^(Statements|Branches|Functions|Lines)\s*:/.test(line));
  summary(['### Unit tests', '', '```', ...table, '```', '', `lcov: ${files} files`].join('\n'));
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      shard: { type: 'string' },
      audit: { type: 'boolean', default: false },
      merge: { type: 'boolean', default: false },
      expect: { type: 'string' },
    },
  });
  if (values.shard !== undefined) return shard(values.shard);
  if (values.audit) return audit();
  if (values.merge) return merge(values.expect === undefined ? undefined : Number(values.expect));
  await codegen();
  await $`${vitest} run`.cwd(root);
}
