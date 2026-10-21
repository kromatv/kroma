import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { root } from './root';
import { smoke } from './sdk/smoke';
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

export async function main(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === 'stage') return runStage(rest);
  if (sub === 'smoke') return runSmoke(rest);
  throw new Error('usage: bun run ci sdk <stage|smoke> [options]');
}
