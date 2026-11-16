import { describe, expect, it } from 'vitest';
import { sha } from '#site/github/test-support';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { setupView } from './setup';

const ORIGIN = 'https://lingua.test';
const OAUTH = { GITHUB_OAUTH_CLIENT_ID: 'id', GITHUB_OAUTH_CLIENT_SECRET: 'secret' };
const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });

async function storeWith(...ids: string[]): Promise<Store> {
  const store = memoryStore();
  await Promise.all(ids.map((id) => store.upsertProject({ id: id, branch: 'main', pinned: false })));
  return store;
}

const synced = (store: Store, id: string, configError: string | null = null) =>
  store.setSynced(id, { headSha: sha('a'), treeSha: sha('0e'), config: configError ? null : CONFIG, configError, at: 1 });

describe('setupView', () => {
  it('shows sign-in as set once both OAuth secrets are, and lists nothing while no repository is', async () => {
    const view = await setupView({ env: OAUTH, store: memoryStore(), viewer: null }, ORIGIN);

    expect(view).toEqual({ viewer: null, origin: ORIGIN, signIn: true, repositories: [] });
  });

  it('tells where the sync of each listed repository stands', async () => {
    const store = await storeWith('o/current', 'o/reading', 'o/failed', 'o/broken');
    await Promise.all([synced(store, 'o/current'), synced(store, 'o/reading'), synced(store, 'o/broken', 'lingua.json is missing')]);
    await store.setBranchHead('o/reading', { sha: sha('b'), etag: null, progress: { done: 40, total: 90 } });
    await store.endSync('o/current', { at: 7, error: null });
    await store.endSync('o/failed', { at: 8, error: 'GET /repos/o/failed/commits/main: Not Found' });
    const env = { LINGUA_PROJECTS: 'o/current, o/reading, o/failed, o/broken, o/new@next' };

    const view = await setupView({ env, store, viewer: null }, ORIGIN);

    expect(view.signIn).toBe(false);
    expect(view.repositories).toEqual([
      { id: 'o/current', branch: 'main', checkedAt: 7, sync: { kind: 'current' }, configError: null },
      { id: 'o/reading', branch: 'main', checkedAt: null, sync: { kind: 'reading', progress: { done: 40, total: 90 } }, configError: null },
      { id: 'o/failed', branch: 'main', checkedAt: 8, sync: { kind: 'failed', error: 'GET /repos/o/failed/commits/main: Not Found' }, configError: null },
      { id: 'o/broken', branch: 'main', checkedAt: null, sync: { kind: 'current' }, configError: 'lingua.json is missing' },
      { id: 'o/new', branch: 'next', checkedAt: null, sync: { kind: 'waiting' }, configError: null },
    ]);
  });

  it('shows a repository it holds but never read as waiting for its first sync', async () => {
    const store = await storeWith('o/r');

    const view = await setupView({ env: { LINGUA_PROJECTS: 'o/r' }, store, viewer: null }, ORIGIN);

    expect(view.repositories[0]?.sync).toEqual({ kind: 'waiting' });
  });
});
