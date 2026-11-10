import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const Manifest = z.object({ name: z.string() });
const MAX_DEPTH = 20;
const NO_CHECKOUT = join(homedir(), '.kroma', 'no-checkout');

/**
 * The checkout a run started in `start` belongs to, found by walking up, and
 * failing that the one `source` sits in. A run with neither, as one installed
 * from npm, gets a folder that does not exist, so nothing reads as built here.
 */
export const findRoot = (start: string, source = dirname(fileURLToPath(import.meta.url))): string =>
  walkUp(start) ?? walkUp(source) ?? NO_CHECKOUT;

/** The checkout this run belongs to. */
export const root = findRoot(process.cwd());

function walkUp(start: string): string | null {
  let directory = resolve(start);
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (isRepository(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
  return null;
}

function isRepository(directory: string): boolean {
  const manifest = join(directory, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    return Manifest.parse(JSON.parse(readFileSync(manifest, 'utf8'))).name === 'kroma';
  } catch {
    return false;
  }
}
