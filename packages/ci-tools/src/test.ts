import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { summary } from './actions';
import { root } from './root';
import { expectedBlobs, parseShard } from './shard';

const REPORTS = join(root, '.vitest-reports');
const LCOV = join(root, 'coverage/lcov.info');
const vitest = join(root, 'node_modules/.bin/vitest');

const COVERAGE = ['--coverage', '--coverage.reporter=lcov', '--coverage.reporter=text-summary'];

async function codegen(): Promise<void> {
  await $`bun run test:codegen`.cwd(root);
}

async function shard(spec: string): Promise<void> {
  const { index, total } = parseShard(spec);
  await codegen();
  await $`${vitest} run --reporter=blob --shard=${index}/${total} ${COVERAGE}`.cwd(root);
}

async function merge(total: number | undefined): Promise<void> {
  if (total !== undefined) {
    const missing = expectedBlobs(total).filter((name) => !existsSync(join(REPORTS, name)));
    if (missing.length > 0) throw new Error(`missing shard report(s): ${missing.join(', ')}`);
  }
  await codegen();
  const out = await $`${vitest} run --merge-reports ${COVERAGE}`.cwd(root).text();
  process.stdout.write(out);
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
      merge: { type: 'boolean', default: false },
      expect: { type: 'string' },
    },
  });
  if (values.shard !== undefined) return shard(values.shard);
  if (values.merge) return merge(values.expect === undefined ? undefined : Number(values.expect));
  await codegen();
  await $`${vitest} run`.cwd(root);
}
