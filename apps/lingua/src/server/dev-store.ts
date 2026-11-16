import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CONFIG_PATH, parseConfig, placeOf, rootOf } from '#site/core/config';
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
  if (root) await seedFrom(store, root);
  return store;
}

async function seedFrom(store: Store, root: string): Promise<void> {
  const text = await readFile(join(root, CONFIG_PATH), 'utf8');
  const parsed = parseConfig(text);
  await store.upsertProject({ id: DEV_PROJECT, branch: 'main', pinned: false });
  if (!parsed.ok) {
    await store.setSynced(DEV_PROJECT, { headSha: 'dev', treeSha: 'dev', config: null, configError: parsed.error, at: 0 });
    return;
  }
  const projectRoot = rootOf(parsed.config);
  const entries = await readdir(join(root, projectRoot), { recursive: true }).catch((): string[] => []);
  const placed = entries.flatMap((entry) => {
    const path = `${projectRoot}/${entry.replaceAll('\\', '/')}`;
    const place = placeOf(projectRoot, path);
    return place ? [{ ...place, path }] : [];
  });
  const files: FileRow[] = await Promise.all(
    placed.map(async (place) => ({ ...place, blobSha: 'dev', body: await readFile(join(root, place.path), 'utf8') })),
  );
  await store.replaceFiles(DEV_PROJECT, files, []);
  await store.setSynced(DEV_PROJECT, { headSha: 'dev', treeSha: 'dev', config: text, configError: null, at: Math.floor(Date.now() / 1000) });
}
