// The Vite plugin that serves the workbench's prop docs. The reading itself is
// in props-read.ts, and the cache it is served through in virtual-cache.ts.

import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
// Spelled with its extension: this module is loaded by Node itself, as a
// dependency of vitest.config.ts, and Node's ESM resolver does not guess one.
import { readPropDocs } from './props-read.ts';
import { scanSources, statLine } from './source-fingerprint.ts';
import { cachedVirtualModule } from './virtual-cache.ts';

export type { PropDoc, PropDocs } from './props-read.ts';
export { readPropDocs };

// The nearest lockfile above the project: a dependency bump can change an
// inherited prop's type (ViewProps and friends), and this is the cheap signal
// for it.
async function lockfileOf(root: string): Promise<string> {
  for (let dir = root; ; ) {
    const candidate = join(dir, 'bun.lock');
    const s = await stat(candidate).catch(() => null);
    if (s) return candidate;
    const up = dirname(dir);
    if (up === dir) return candidate;
    dir = up;
  }
}

async function fingerprint(
  tsconfig: string,
  include: (fileName: string) => boolean,
): Promise<string> {
  const root = dirname(tsconfig);
  const sources = await scanSources(join(root, 'src'), include);
  const lines = await Promise.all([tsconfig, await lockfileOf(root), ...sources].map(statLine));
  return lines.join('\n');
}

export interface PropDocsOptions {
  // The project whose program the components live in.
  tsconfig: string;
  // Which of its files to scan. Defaults to everything but tests and stories.
  include?: (fileName: string) => boolean;
  // Files whose changes should refresh the docs during `vite dev`. Defaults to anything the
  // `include` filter accepts.
  watch?: (fileName: string) => boolean;
}

const DEFAULT_INCLUDE = (fileName: string): boolean =>
  fileName.includes('/packages/ui/src/') &&
  /\.tsx?$/.test(fileName) &&
  !/\.(stories|demo|test|fixtures)\.tsx$/.test(fileName);

/**
 * Serves `virtual:kroma-props`: every component's props, read by the checker.
 *
 * Cached on disk against a fingerprint of the scanned sources: opening the
 * checker costs seconds, and most builds change no component.
 */
export function propDocs(options: PropDocsOptions): import('vite').Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  return cachedVirtualModule({
    id: 'props-docs',
    virtual: 'virtual:kroma-props',
    binding: 'PROPS',
    version: 3,
    fingerprint: () => fingerprint(options.tsconfig, include),
    read: () => readPropDocs(options.tsconfig, include),
    watch: options.watch ?? include,
  });
}
