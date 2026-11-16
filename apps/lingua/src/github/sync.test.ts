import { describe, expect, it } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { discoverInstallation, syncProject } from './sync';
import { fakeGitHub, sha } from './test-support';

const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });

const BRANCH = 'GET /repos/o/r/branches/main';
const TREE = `GET /repos/o/r/git/trees/${sha('0e')}?recursive=1`;

function repository(head: string, files: Record<string, string>) {
  const blobs: Record<string, string> = { [sha('c')]: CONFIG };
  const tree = [
    { path: 'lingua.json', type: 'blob', sha: sha('c') },
    { path: 'README.md', type: 'blob', sha: sha('d') },
  ];
  for (const [path, body] of Object.entries(files)) {
    const oid = sha(String(Object.keys(blobs).length + 1));
    blobs[oid] = body;
    tree.push({ path, type: 'blob', sha: oid });
  }
  return fakeGitHub({
    routes: {
      [BRANCH]: () => ({ commit: { sha: head, commit: { tree: { sha: sha('0e') } } } }),
      [TREE]: () => ({ truncated: false, tree }),
    },
    blobs,
  });
}

async function current(store: Store) {
  const found = await store.project('o/r');
  if (!found) {
    throw new Error('the project was not seeded');
  }
  return found;
}

async function seeded() {
  const store = memoryStore();
  await store.upsertProject('o/r', 1, 'main');
  return store;
}

async function sync(store: Store, gh: ReturnType<typeof fakeGitHub>, now: number) {
  return syncProject({ gh, store }, await current(store), now);
}

describe('syncProject', () => {
  it('copies every file of the project folder, sub-folders and locks included, and only those', async () => {
    const store = await seeded();
    const gh = repository(sha('a'), {
      'loc/i18n.json': '{"source":"en"}',
      'loc/catalogs.ts': 'export {};',
      'loc/en/nav.json': '{"nav.home":"Home"}',
      'loc/fr/admin/backup.json': '{"admin.backup.title":"Sauvegarde"}',
      'loc/fr/i18n.lock': '{}',
    });

    const moved = await sync(store, gh, 100);

    expect(moved).toBe(true);
    const files = (await store.files('o/r')).map((f) => `${f.kind} ${f.locale} ${f.file}`);
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
    });
  });

  it('does nothing while the default branch has not moved', async () => {
    const store = await seeded();
    const gh = repository(sha('a'), { 'loc/en/nav.json': '{}' });
    await sync(store, gh, 100);
    gh.calls.length = 0;

    const moved = await sync(store, gh, 200);

    expect(moved).toBe(false);
    expect(gh.calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('forgets a catalog file the branch deleted', async () => {
    const store = await seeded();
    await sync(
      store,
      repository(sha('a'), { 'loc/en/nav.json': '{}', 'loc/fr/nav.json': '{}' }),
      100,
    );

    await sync(store, repository(sha('b'), { 'loc/en/nav.json': '{}' }), 200);

    expect((await store.files('o/r')).map((f) => f.path)).toEqual(['loc/en/nav.json']);
  });

  it('records why a project without a lingua.json cannot be read', async () => {
    const store = await seeded();
    const gh = fakeGitHub({
      routes: {
        [BRANCH]: () => ({ commit: { sha: sha('a'), commit: { tree: { sha: sha('0e') } } } }),
        [TREE]: () => ({ truncated: false, tree: [] }),
      },
    });

    await sync(store, gh, 100);

    expect((await store.project('o/r'))?.configError).toBe('lingua.json is missing');
  });
});

describe('discoverInstallation', () => {
  it('tracks the branch an operator pinned instead of the default one', async () => {
    const store = memoryStore();
    const gh = fakeGitHub({
      routes: {
        'GET /installation/repositories?per_page=100': () => ({
          repositories: [{ full_name: 'o/r', default_branch: 'main' }],
        }),
        'GET /repos/o/r/contents/lingua.json?ref=next': () => ({}),
      },
    });

    await discoverInstallation({ gh, store, branches: new Map([['o/r', 'next']]) }, 7);

    expect(await store.project('o/r')).toMatchObject({ installationId: 7, branch: 'next' });
  });
});
