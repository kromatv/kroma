import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { root } from './root';
import { smoke, tarballIn } from './sdk/smoke';
import { stage } from './sdk/stage';

const DEFAULT_OUT = join(root, 'dist', 'sdk');

async function runStage(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      out: { type: 'string', default: DEFAULT_OUT },
    },
  });
  const version = values.version ?? process.env.VERSION;
  if (!version) throw new Error('sdk stage: --version X.Y.Z is required (or VERSION)');
  console.log(`staged ${await stage({ version, out: values.out ?? DEFAULT_OUT })}`);
}

async function runSmoke(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', default: DEFAULT_OUT },
      'no-rust': { type: 'boolean', default: false },
    },
  });
  await smoke({ out: values.out ?? DEFAULT_OUT, rust: !values['no-rust'] });
}

/** Publishes the staged tarball: the one public package. */
async function runPublish(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', default: DEFAULT_OUT },
      tag: { type: 'string', default: 'latest' },
      'dry-run': { type: 'boolean', default: false },
      provenance: { type: 'boolean', default: false },
    },
  });
  const tarball = tarballIn(values.out ?? DEFAULT_OUT);
  const args = ['publish', tarball, '--access', 'public', '--tag', values.tag ?? 'latest'];
  if (values['dry-run']) args.push('--dry-run');
  if (values.provenance) args.push('--provenance');
  console.log(`npm ${args.join(' ')}`);
  await $`npm ${args}`;
}

export async function main(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === 'stage') return runStage(rest);
  if (sub === 'smoke') return runSmoke(rest);
  if (sub === 'publish') return runPublish(rest);
  throw new Error('usage: bun run ci sdk <stage|smoke|publish> [options]');
}
