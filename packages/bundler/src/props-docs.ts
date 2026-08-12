// The Vite plugin that serves the workbench's prop docs, and the on-disk cache
// that keeps a build from paying for the checker twice. The reading itself is
// in props-read.ts.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
// Spelled with its extension: this module is loaded by Node itself, as a
// dependency of vitest.config.ts, and Node's ESM resolver does not guess one.
import { type PropDoc, type PropDocs, readPropDocs } from './props-read.ts';

export type { PropDoc, PropDocs };
export { readPropDocs };

// Bumped when the extraction logic changes shape, so a stale cache from an
// older plugin cannot serve.
const CACHE_VERSION = 3;

async function statLine(path: string): Promise<string> {
  const s = await stat(path).catch(() => null);
  return s ? `${path}:${s.mtimeMs}:${s.size}` : `${path}:absent`;
}

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

/** A hash of everything the docs are derived from: the scanned sources' paths,
 *  sizes and mtimes, the tsconfig, and the lockfile. Cheap enough to run per
 *  build - a directory walk, no file reads. Walks `src` only: the package root
 *  holds a node_modules whose workspace symlinks recurse into each other. */
async function fingerprint(tsconfig: string, include: (fileName: string) => boolean) {
  const root = dirname(tsconfig);
  const src = join(root, 'src');
  const entries = await readdir(src, { recursive: true });
  const sources = entries
    .map((entry) => join(src, entry))
    .filter((path) => /\.tsx?$/.test(path) && include(path))
    .sort((a, b) => (a < b ? -1 : 1));
  const lines = await Promise.all([tsconfig, await lockfileOf(root), ...sources].map(statLine));
  return createHash('sha256')
    .update(`${CACHE_VERSION}\n${lines.join('\n')}`)
    .digest('hex');
}

const cacheFile = (hash: string): string =>
  join(process.cwd(), 'node_modules', '.cache', 'kroma', `props-docs-${hash}.json`);

async function readCache(hash: string): Promise<string | null> {
  return readFile(cacheFile(hash), 'utf8').catch(() => null);
}

async function writeCache(hash: string, json: string): Promise<void> {
  const path = cacheFile(hash);
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, json).catch(() => {});
}

// The module a host imports to get the docs. Virtual: nothing is written to disk, so there is
// no generated artifact to keep in step or to gitignore.
const VIRTUAL = 'virtual:kroma-props';
// Rollup's convention for "this id belongs to a plugin, do not touch it".
const RESOLVED = `\0${VIRTUAL}`;

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
  fileName.includes('/packages/ui/src/') && !/\.(stories|demo|test)\.tsx$/.test(fileName);

/**
 * Serves `virtual:kroma-props` — every component's props, read by the checker.
 *
 * A plugin rather than a codegen script on purpose. The objection to generating
 * this has always been "another build artifact to keep in step"; a virtual
 * module has no artifact. It is computed from the components themselves on every
 * build, and invalidated when one of them changes, so it cannot drift.
 */
export function propDocs(options: PropDocsOptions): import('vite').Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const watch = options.watch ?? include;
  return {
    name: 'kroma:props-docs',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    // Cached on disk against a fingerprint of the scanned sources: opening the
    // checker costs seconds, and most builds change no component. A source edit
    // moves the fingerprint and the build recomputes.
    async load(id) {
      if (id !== RESOLVED) return null;
      // A cache failure must never fail the build: no hash simply means
      // recompute, exactly as if the cache did not exist.
      const hash = await fingerprint(options.tsconfig, include).catch(() => null);
      const cached = hash ? await readCache(hash) : null;
      if (cached) return `export const PROPS = ${cached};`;
      const docs = await readPropDocs(options.tsconfig, include);
      const json = JSON.stringify(docs);
      if (hash) await writeCache(hash, json);
      return `export const PROPS = ${json};`;
    },
    // Editing a prop's type or its doc comment refreshes the panel, rather than
    // needing the dev server restarted - which is the difference between the
    // Props tab being trustworthy and being something you stop believing.
    handleHotUpdate({ file, server }) {
      if (!watch(file)) return;
      const mod = server.moduleGraph.getModuleById(RESOLVED);
      if (mod) server.moduleGraph.invalidateModule(mod);
    },
  };
}
