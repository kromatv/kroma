// What a build-time extractor's cache is keyed on: the files it reads, as their
// paths, sizes and mtimes. A directory walk and no file reads, so a build that
// has already extracted this tree pays only for the walk.

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** One file's line in a cache key, or the fact that it is absent - which is
 *  itself a fingerprint, since a file appearing has to move the key. */
export async function statLine(path: string): Promise<string> {
  const found = await stat(path).catch(() => null);
  return found ? `${path}:${found.mtimeMs}:${found.size}` : `${path}:absent`;
}

/** Every `.ts`/`.tsx`/`.mdx` file under `root` that `accept` takes, sorted.
 *  Takes the source directory rather than a package root: a package root holds
 *  a node_modules whose workspace symlinks recurse into each other. */
export async function scanSources(
  root: string,
  accept: (path: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries
    .map((entry) => join(root, entry))
    .filter((path) => /\.(tsx?|mdx)$/.test(path) && accept(path))
    .sort((a, b) => (a < b ? -1 : 1));
}
