// The Vite plugin that serves the workbench's history, and the on-disk cache
// that keeps a dev start from re-reading a log it has already read. The reading
// itself is in git-history-read.ts.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
// Spelled with its extension: this module is loaded by Node itself, as a
// dependency of a vite config, and Node's ESM resolver does not guess one.
import {
  type GitHistoryOptions,
  historyFingerprint,
  NO_HISTORY,
  readGitHistory,
} from './git-history-read.ts';

export type {
  GitHistory,
  GitHistoryOptions,
  HistoryCommit,
  HistoryEntry,
} from './git-history-read.ts';

// Bumped when the extraction changes shape, so a stale cache from an older
// plugin cannot serve.
const CACHE_VERSION = 1;

const VIRTUAL = 'virtual:kroma-history';
// Rollup's convention for "this id belongs to a plugin, do not touch it".
const RESOLVED = `\0${VIRTUAL}`;

const cacheFile = (hash: string): string =>
  join(process.cwd(), 'node_modules', '.cache', 'kroma', `git-history-${hash}.json`);

async function fingerprint(options: GitHistoryOptions): Promise<string> {
  const source = await historyFingerprint(options);
  return createHash('sha256').update(`${CACHE_VERSION}\n${options.root}\n${source}`).digest('hex');
}

async function readCache(hash: string): Promise<string | null> {
  return readFile(cacheFile(hash), 'utf8').catch(() => null);
}

async function writeCache(hash: string, json: string): Promise<void> {
  const path = cacheFile(hash);
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, json).catch(() => {});
}

/**
 * Serves `virtual:kroma-history`: when every component and article under
 * `root` was written and last changed, and the commits behind that.
 *
 * Virtual, like the prop docs: nothing is written to disk, so there is no
 * generated artifact to keep in step. Cached against the revision and the
 * working tree's own changes, because reading the whole log is the one part of
 * this that costs anything.
 */
export function gitHistory(options: GitHistoryOptions): import('vite').Plugin {
  return {
    name: 'kroma:git-history',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    async load(id) {
      if (id !== RESOLVED) return null;
      // A cache failure must never fail the build: no hash simply means
      // recompute, exactly as if the cache did not exist.
      const hash = await fingerprint(options).catch(() => null);
      const cached = hash ? await readCache(hash) : null;
      if (cached) return `export const HISTORY = ${cached};`;
      // A build made from a tarball, or with no git on the path, still builds.
      const json = JSON.stringify(await readGitHistory(options).catch(() => NO_HISTORY));
      if (hash) await writeCache(hash, json);
      return `export const HISTORY = ${json};`;
    },
  };
}
