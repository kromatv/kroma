import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { CONFIG_PATH, matchCatalog, parseConfig } from '#site/core/config';
import { memoryStore } from '#site/store/memory-store';
import type { FileRow, Store } from '#site/store/store';

const DEV_PROJECT = 'kromatv/kroma';

async function repositoryRoot(from: string): Promise<string | null> {
  for (let dir = from; ; dir = dirname(dir)) {
    const found = await readFile(join(dir, CONFIG_PATH), 'utf8').then(
      () => true,
      () => false,
    );
    if (found) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/** A store holding the checkout this dev server runs in, read from disk, so the pages render without D1 or GitHub. */
export async function devStore(): Promise<Store> {
  const store = memoryStore();
  const root = await repositoryRoot(process.cwd());
  if (!root) return store;
  const text = await readFile(join(root, CONFIG_PATH), 'utf8');
  const parsed = parseConfig(text);
  await store.upsertProject(DEV_PROJECT, 0, 'main');
  if (!parsed.ok) {
    await store.setSynced(DEV_PROJECT, { headSha: 'dev', treeSha: 'dev', config: null, configError: parsed.error, at: 0 });
    return store;
  }
  const files: FileRow[] = [];
  for (const { path } of parsed.config.catalogs) {
    const base = join(root, dirname(path.slice(0, path.indexOf('{'))));
    const entries = await readdir(base, { recursive: true }).catch(() => [] as string[]);
    for (const entry of entries) {
      const file = relative(root, join(base, entry));
      const match = matchCatalog(parsed.config, file);
      if (match) files.push({ ...match, blobSha: 'dev', body: await readFile(join(root, file), 'utf8') });
    }
  }
  await store.replaceFiles(DEV_PROJECT, files, []);
  await store.setSynced(DEV_PROJECT, { headSha: 'dev', treeSha: 'dev', config: text, configError: null, at: Math.floor(Date.now() / 1000) });
  return store;
}
