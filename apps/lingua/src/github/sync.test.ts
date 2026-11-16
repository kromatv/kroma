import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { reader } from './reader';
import { syncProject } from './sync';
import { gitHubFetch, sha } from './test-support';

const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });
const HEAD = 'GET /repos/o/r/commits/main';

const blobOf = (body: string) => createHash('sha1').update(body).digest('hex');

function repository(head: string, files: Record<string, string>, config: string | null = CONFIG) {
  const all = config === null ? files : { 'lingua.json': config, 'README.md': '# r', ...files };
  const tree = Object.entries(all).map(([path, body]) => ({
    path,
    type: 'blob',
    sha: blobOf(body),
  }));
  const raw = Object.entries(all).map(([path, body]) => [
    `GET /o/r/${head}/${path}`,
    () => new Response(body),
  ]);
  return gitHubFetch({
    routes: {
      [HEAD]: (_, headers) =>
        headers.get('if-none-match') === `"${head}"`
          ? new Response(null, { status: 304 })
          : new Response(head, { headers: { etag: `"${head}"` } }),
      [`GET /repos/o/r/git/trees/${head}?recursive=1`]: () => ({
        sha: sha('0e'),
        truncated: false,
        tree,
      }),
      ...Object.fromEntries(raw),
    },
  });
}

async function seeded(): Promise<Store> {
  const store = memoryStore();
  await store.upsertProject({ id: 'o/r', branch: 'main', pinned: false });
  return store;
}

async function pass(
  store: Store,
  fetchFn: typeof fetch,
  at: { now?: number; requests?: number } = {},
) {
  const project = await store.project('o/r');
  if (!project) {
    throw new Error('the project was not seeded');
  }
  const read = reader({ oauth: null, requests: at.requests ?? 45 }, fetchFn);
  return syncProject({ reader: read, store }, project, at.now ?? 100);
}

const catalogs = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`loc/en/f${i}.json`, `{"k${i}":"v"}`]),
  );

describe('syncProject', () => {
  it('copies every file of the project folder, sub-folders and locks included, and only those', async () => {
    const store = await seeded();
    const fetchFn = repository(sha('a'), {
      'loc/i18n.json': '{"source":"en"}',
      'loc/catalogs.ts': 'export {};',
      'loc/en/nav.json': '{"nav.home":"Home"}',
      'loc/fr/admin/backup.json': '{"admin.backup.title":"Sauvegarde"}',
      'loc/fr/i18n.lock': '{}',
    });

    const outcome = await pass(store, fetchFn);

    const files = (await store.files('o/r')).map((f) => `${f.kind} ${f.locale} ${f.file}`);
    expect(outcome).toBe('moved');
    expect(files.sort((a, b) => a.localeCompare(b))).toEqual([
      'catalog en nav',
      'catalog fr admin/backup',
      'lock fr ',
      'policy  ',
    ]);
    expect(await store.project('o/r')).toMatchObject({
      headSha: sha('a'),
      treeSha: sha('0e'),
      config: CONFIG,
      configError: null,
      progress: null,
    });
  });

  it('reads a large change over several passes, and records the head only once every file is stored', async () => {
    const store = await seeded();
    const fetchFn = repository(sha('a'), catalogs(90));

    const outcomes = [await pass(store, fetchFn, { now: 100 })];
    const first = await store.project('o/r');
    outcomes.push(await pass(store, fetchFn, { now: 200 }));
    const second = await store.project('o/r');
    outcomes.push(await pass(store, fetchFn, { now: 300 }));

    expect(outcomes).toEqual(['behind', 'behind', 'moved']);
    expect([first?.headSha, first?.progress]).toEqual([null, { done: 40, total: 90 }]);
    expect([second?.headSha, second?.progress]).toEqual([null, { done: 80, total: 90 }]);
    expect(await store.project('o/r')).toMatchObject({
      headSha: sha('a'),
      branchSha: sha('a'),
      progress: null,
      syncedAt: 300,
    });
    expect(await store.files('o/r')).toHaveLength(90);
  });

  it('asks once, conditionally, about a branch that has not moved', async () => {
    const store = await seeded();
    const fetchFn = repository(sha('a'), { 'loc/en/nav.json': '{}' });
    await pass(store, fetchFn);
    fetchFn.calls.length = 0;
    fetchFn.headers.length = 0;

    const outcome = await pass(store, fetchFn, { now: 200 });

    expect(outcome).toBe('unchanged');
    expect(fetchFn.calls.map((c) => c.path)).toEqual(['/repos/o/r/commits/main']);
    expect(fetchFn.headers[0]?.get('if-none-match')).toBe(`"${sha('a')}"`);
  });

  it('records the head of a branch that matches the copy without reading anything else', async () => {
    const store = await seeded();
    await store.setSynced('o/r', {
      headSha: sha('a'),
      treeSha: sha('0e'),
      config: CONFIG,
      configError: null,
      at: 1,
    });
    const fetchFn = repository(sha('a'), {});

    await pass(store, fetchFn);

    expect(fetchFn.calls).toHaveLength(1);
    expect(await store.project('o/r')).toMatchObject({
      branchSha: sha('a'),
      etag: `"${sha('a')}"`,
    });
  });

  it('leaves the files for the next pass when the budget cannot reach the tree', async () => {
    const store = await seeded();
    const fetchFn = repository(sha('a'), { 'loc/en/nav.json': '{}' });

    const outcome = await pass(store, fetchFn, { requests: 2 });

    expect(outcome).toBe('behind');
    expect(fetchFn.calls).toHaveLength(1);
    expect(await store.project('o/r')).toMatchObject({
      headSha: null,
      branchSha: sha('a'),
      progress: null,
    });
  });

  it('forgets a catalog file the branch deleted', async () => {
    const store = await seeded();
    await pass(
      store,
      repository(sha('a'), { 'loc/en/nav.json': '{}', 'loc/fr/nav.json': '{"x":"y"}' }),
    );

    await pass(store, repository(sha('b'), { 'loc/en/nav.json': '{}' }));

    expect((await store.files('o/r')).map((f) => f.path)).toEqual(['loc/en/nav.json']);
  });

  it('records why a project without a lingua.json cannot be read', async () => {
    const store = await seeded();

    await pass(store, repository(sha('a'), {}, null));

    expect((await store.project('o/r'))?.configError).toBe('lingua.json is missing');
  });

  it('records why a tree too large to read in one request cannot be read', async () => {
    const store = await seeded();
    const fetchFn = gitHubFetch({
      routes: {
        [HEAD]: () => new Response(sha('a')),
        [`GET /repos/o/r/git/trees/${sha('a')}?recursive=1`]: () => ({
          sha: sha('0e'),
          truncated: true,
          tree: [],
        }),
      },
    });

    await pass(store, fetchFn);

    expect((await store.project('o/r'))?.configError).toBe(
      'the repository tree is too large to read in one request',
    );
  });

  it('records why a lingua.json that does not parse cannot be read', async () => {
    const store = await seeded();

    await pass(store, repository(sha('a'), {}, '{}'));

    expect((await store.project('o/r'))?.configError).toMatch(/^lingua\.json/);
  });
});
