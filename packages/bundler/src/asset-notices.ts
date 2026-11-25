import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import type { Notice } from './notices.ts';

/**
 * The file a folder of vendored files (fonts, sounds) keeps beside them:
 * each work, the files of it the folder holds, and its notice file.
 */
export const SIDECAR = 'third-party.json';

const Sidecar = z.array(
  z.object({
    name: z.string().nonempty(),
    version: z.string().nonempty(),
    license: z.string().nonempty(),
    source: z.url(),
    files: z.array(z.string()).nonempty(),
    notice: z.string().nonempty(),
  }),
);

function folderNotices(dir: string, names: ReadonlySet<string>): Notice[] {
  const file = join(dir, SIDECAR);
  if (!existsSync(file)) {
    return [];
  }
  return Sidecar.parse(JSON.parse(readFileSync(file, 'utf8')))
    .filter((work) => work.files.some((name) => names.has(name)))
    .map((work) => ({
      name: work.name,
      version: work.version,
      license: work.license,
      source: work.source,
      texts: [readFileSync(join(dir, work.notice), 'utf8').trim()],
    }));
}

/**
 * The notices of this repository's own vendored files among `files`: each
 * work a `third-party.json` beside one of them names, once.
 */
export function assetNotices(files: Iterable<string>): Notice[] {
  const byFolder = new Map<string, Set<string>>();
  for (const file of files) {
    const dir = dirname(file);
    byFolder.set(dir, (byFolder.get(dir) ?? new Set()).add(basename(file)));
  }
  return [...byFolder].flatMap(([dir, names]) => folderNotices(dir, names));
}
