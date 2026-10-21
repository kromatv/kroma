import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { summary } from './actions';
import { readTarball } from './npm/tar';
import { publishTarball } from './npm/publish';
import { npmRegistry } from './npm/registry';

async function runPublish(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      tag: { type: 'string' },
      provenance: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const [tarball] = positionals;
  if (!tarball || !values.tag) throw new Error(USAGE);
  const result = await publishTarball(
    {
      tarball,
      tag: values.tag,
      provenance: values.provenance ?? false,
      dryRun: values['dry-run'] ?? false,
    },
    {
      registry: npmRegistry,
      read: readTarball,
      load: async (path) => new Uint8Array(await readFile(path)),
    },
  );
  const verdict = result.publish ? 'published' : 'skipped';
  console.log(`${result.name}@${values.tag}: ${verdict}, ${result.reason}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    summary(`${result.name} \`${values.tag}\`: **${verdict}**, ${result.reason}\n`);
  }
}

const USAGE = 'usage: bun run ci npm publish <tarball> --tag <tag> [--provenance] [--dry-run]';

export async function main(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === 'publish') return runPublish(rest);
  throw new Error(USAGE);
}
