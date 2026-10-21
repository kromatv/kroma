import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './root';
import { baselineVersion, nextStep } from './schema-step';

const SCHEMA = join(root, 'server/crates/kroma-db/src/schema');

/**
 * `bun run ci schema new <name>`: the next core schema step, an empty `.sql`
 * file under `schema/steps/` and its entry at the end of `steps.rs`.
 */
export async function main(args: string[]): Promise<void> {
  const [verb, slug] = args;
  if (verb !== 'new' || !slug) throw new Error('usage: bun run ci schema new <snake_case_name>');
  const stepsRs = join(SCHEMA, 'steps.rs');
  const baseline = baselineVersion(await readFile(join(SCHEMA, '../schema.rs'), 'utf8'));
  const step = nextStep(await readFile(stepsRs, 'utf8'), baseline, slug);
  const file = join(SCHEMA, step.file);
  if (existsSync(file)) throw new Error(`${step.file} already exists`);
  await mkdir(join(SCHEMA, 'steps'), { recursive: true });
  await writeFile(file, '');
  await writeFile(stepsRs, step.steps);
  console.log(`schema step ${step.version}: server/crates/kroma-db/src/schema/${step.file}`);
}
