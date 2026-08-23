import { existsSync, lstatSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { notice } from './actions';
import { root } from './root';

const WORKSPACE_ROOTS = ['apps', 'clients', 'modules', 'packages'];

function pruneLinks(dir: string): number {
  let removed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (path.includes('node_modules')) {
        unlinkSync(path);
        removed++;
      }
    } else if (entry.isDirectory()) {
      removed += pruneLinks(path);
    }
  }
  return removed;
}

const records = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('SF:')).length;

async function prepare(): Promise<void> {
  let removed = 0;
  for (const name of WORKSPACE_ROOTS) {
    const dir = join(root, name);
    if (existsSync(dir) && lstatSync(dir).isDirectory()) removed += pruneLinks(dir);
  }
  console.log(`pruned ${removed} workspace node_modules link(s)`);

  const js = join(root, 'coverage/lcov.info');
  if (!existsSync(js))
    throw new Error('coverage/lcov.info is missing: without it every file scores 0%');
  console.log(`JS/TS coverage: ${records(js)} files`);

  const rust = join(root, 'server/lcov.info');
  if (existsSync(rust)) console.log(`Rust coverage: ${records(rust)} files`);
  else notice('no Rust coverage this run (no Rust changed); the scan carries JS/TS coverage only');
}

export async function main(argv: string[]): Promise<void> {
  if (argv[0] === 'prepare') return prepare();
  throw new Error('usage: bun run ci sonar prepare');
}
