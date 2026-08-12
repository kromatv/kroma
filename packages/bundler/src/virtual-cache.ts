// A build-time extractor served as a virtual module, with the on-disk cache
// that keeps a build from paying for it twice.
//
// Both extractors that need one - the workbench's prop docs and its git history
// - read something expensive (a type checker, the whole log), have no artifact
// on disk to keep in step, and must not fail a build when either the cache or
// the reading itself does. That is the shape here; what is read is the caller's.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface CachedVirtualOptions {
  id: string;
  virtual: string;
  binding: string;
  version: number;
  fingerprint: () => Promise<string>;
  read: () => Promise<unknown>;
  watch?: (file: string) => boolean;
}

const cacheFile = (id: string, hash: string): string =>
  join(process.cwd(), 'node_modules', '.cache', 'kroma', `${id}-${hash}.json`);

async function readCache(id: string, hash: string): Promise<string | null> {
  return readFile(cacheFile(id, hash), 'utf8').catch(() => null);
}

async function writeCache(id: string, hash: string, json: string): Promise<void> {
  const path = cacheFile(id, hash);
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, json).catch(() => {});
}

/**
 * The plugin serving `virtual`, as `export const <binding> = …`.
 *
 * Virtual on purpose: the standing objection to generating this kind of thing
 * is "another build artifact to keep in step", and a virtual module has no
 * artifact. `fingerprint` names everything the value derives from, so a source
 * edit - or a bumped `version` - recomputes; a fingerprint that throws simply
 * recomputes too, exactly as if the cache did not exist, because a cache
 * failure must never fail a build. `watch` refreshes the module during
 * `vite dev` for the files it accepts, which is the difference between what it
 * serves being trustworthy and being something you stop believing.
 */
function cachedVirtualModule(options: CachedVirtualOptions): import('vite').Plugin {
  const { id, virtual, binding, version, watch } = options;
  // Rollup's convention for "this id belongs to a plugin, do not touch it".
  const resolved = `\0${virtual}`;
  const hashOf = async (): Promise<string | null> =>
    options
      .fingerprint()
      .then((source) => createHash('sha256').update(`${version}\n${source}`).digest('hex'))
      .catch(() => null);

  return {
    name: `kroma:${id}`,
    resolveId: (source) => (source === virtual ? resolved : null),
    async load(loaded) {
      if (loaded !== resolved) return null;
      const hash = await hashOf();
      const cached = hash ? await readCache(id, hash) : null;
      if (cached) return `export const ${binding} = ${cached};`;
      const json = JSON.stringify(await options.read());
      if (hash) await writeCache(id, hash, json);
      return `export const ${binding} = ${json};`;
    },
    handleHotUpdate({ file, server }) {
      if (!watch?.(file)) return;
      const mod = server.moduleGraph.getModuleById(resolved);
      if (mod) server.moduleGraph.invalidateModule(mod);
    },
  };
}

export { cachedVirtualModule };
