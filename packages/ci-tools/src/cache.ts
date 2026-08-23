import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { z } from 'zod';
import { summary } from './actions';
import { type Entry, stale } from './cache-entries';

const Entries = z.array(
  z.object({ id: z.number().int(), key: z.string().min(1), createdAt: z.string() }),
);

async function list(prefix: string): Promise<Entry[]> {
  const body = await $`gh cache list --key ${prefix} --limit 100 --json id,key,createdAt`.json();
  return Entries.parse(body);
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { prefix: { type: 'string' }, keep: { type: 'string', default: '1' } },
  });
  if (positionals[0] !== 'prune' || !values.prefix) {
    throw new Error('usage: bun run ci cache prune --prefix <key-prefix> [--keep N]');
  }
  const gone = stale(await list(values.prefix), Number(values.keep));
  for (const entry of gone) await $`gh cache delete ${entry.id}`;
  const lines = gone.map((e) => `- ${e.key}`).join('\n');
  summary(
    `### Cache (\`${values.prefix}*\`)\n\n${gone.length} entr${gone.length === 1 ? 'y' : 'ies'} retired\n${lines}`,
  );
}
