import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const Manifest = z.object({ name: z.string() });
const MAX_DEPTH = 20;

/**
 * The checkout a run started in `start` belongs to: found by walking up,
 * because a compiled binary has no source path to count back from, and the
 * checkout this source sits in when the walk finds none.
 */
export const findRoot = (start: string): string => walkUp(start) ?? fromSource();

/** The checkout this run belongs to. */
export const root = findRoot(process.cwd());

function fromSource(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../..');
}

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
