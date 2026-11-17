import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CONFIG_PATH, parseConfig, placeOf, rootOf } from '#site/core/config';
import { memoryStore } from '#site/store/memory-store';
import type { FileRow, Store } from '#site/store/store';

const DEV_PROJECT = 'kromatv/kroma';

const SYNCED = { headSha: 'dev', treeSha: 'dev' };

const exists = (path: string) =>
  readFile(path, 'utf8').then(
    () => true,
    () => false,
  );

async function repositoryRoot(dir: string): Promise<string | null> {
  if (await exists(join(dir, CONFIG_PATH))) {
    return dir;
  }
  const above = dirname(dir);
  return above === dir ? null : repositoryRoot(above);
}

async function projectFiles(root: string, projectRoot: string): Promise<FileRow[]> {
  const entries = await readdir(join(root, projectRoot), { recursive: true }).catch(
    (): string[] => [],
  );
  const placed = entries.flatMap((entry) => {
    const path = `${projectRoot}/${entry.replaceAll('\\', '/')}`;
    const place = placeOf(projectRoot, path);
    return place ? [{ place, path }] : [];
  });
  return Promise.all(
    placed.map(async ({ place, path }) => {
      const body = await readFile(join(root, path), 'utf8');
      return Object.assign(place, { path, blobSha: 'dev', body });
    }),
  );
}

async function seedFrom(store: Store, root: string): Promise<void> {
  const text = await readFile(join(root, CONFIG_PATH), 'utf8');
  const parsed = parseConfig(text);
  await store.upsertProject({ id: DEV_PROJECT, branch: 'main', pinned: false });
  if (!parsed.ok) {
    const failed = { ...SYNCED, config: null, configError: parsed.error, at: 0 };
    await store.setSynced(DEV_PROJECT, failed);
    return;
  }
  await store.replaceFiles(DEV_PROJECT, await projectFiles(root, rootOf(parsed.config)), []);
  const at = Math.floor(Date.now() / 1000);
  await store.setSynced(DEV_PROJECT, { ...SYNCED, config: text, configError: null, at });
}

/** A store holding the checkout this dev server runs in, read from disk, so the pages render without D1 or GitHub. */
export async function devStore(): Promise<Store> {
  const store = memoryStore();
  const root = await repositoryRoot(process.cwd());
  if (root) {
    await seedFrom(store, root);
  }
  return store;
}
