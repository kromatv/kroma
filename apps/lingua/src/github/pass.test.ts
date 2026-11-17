import { describe, expect, it } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import type { Proposal, Store } from '#site/store/store';
import { passIfStale, passOver, trackProjects } from './pass';
import { reader } from './reader';
import { type FakeRepository, gitHubFetch, sha } from './test-support';

const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });

function syncing(store: Store, fake: FakeRepository) {
  const fetchFn = gitHubFetch(fake);
  return { syncing: { reader: reader({ oauth: null, requests: 45 }, fetchFn), store }, fetchFn };
}

async function current(head = sha('a')): Promise<Store> {
  const store = memoryStore();
  await store.upsertProject({ id: 'o/r', branch: 'main', pinned: false });
  await store.setSynced('o/r', {
    headSha: head,
    treeSha: sha('0e'),
    config: CONFIG,
    configError: null,
    at: 1,
    etag: '"e"',
  });
  return store;
}

const unmoved: FakeRepository['routes'] = {
  'GET /repos/o/r/commits/main': () => new Response(null, { status: 304 }),
};

const proposal = (prNumber: number): Proposal => ({
  project: 'o/r',
  userId: prNumber,
  locale: 'fr',
  branch: `u${prNumber}:lingua/fr`,
  prNumber,
  prUrl: `https://github.com/o/r/pull/${prNumber}`,
  headSha: sha('f'),
  updatedAt: 1,
});

describe('trackProjects', () => {
  it('holds a listed repository on its default branch, read from GitHub the first time only', async () => {
    const store = memoryStore();
    const { syncing: first, fetchFn } = syncing(store, {
      routes: { 'GET /repos/o/r': () => ({ default_branch: 'trunk' }) },
    });
    await trackProjects(first, [{ id: 'o/r', branch: null }]);

    await trackProjects(first, [{ id: 'o/r', branch: null }]);

    expect(await store.project('o/r')).toMatchObject({ branch: 'trunk', pinned: false });
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('pins the branch a listing names, and reads the default one again once the pin is gone', async () => {
    const store = memoryStore();
    const { syncing: run } = syncing(store, {
      routes: { 'GET /repos/o/r': () => ({ default_branch: 'main' }) },
    });
    await trackProjects(run, [{ id: 'o/r', branch: 'feat/lingua' }]);
    const pinned = await store.project('o/r');

    await trackProjects(run, [{ id: 'o/r', branch: null }]);

    expect(pinned).toMatchObject({ branch: 'feat/lingua', pinned: true });
    expect(await store.project('o/r')).toMatchObject({ branch: 'main', pinned: false });
  });

  it('moves a pinned repository to the branch its listing names now', async () => {
    const store = memoryStore();
    const { syncing: run, fetchFn } = syncing(store, { routes: {} });
    await trackProjects(run, [{ id: 'o/r', branch: 'feat/a' }]);
    await trackProjects(run, [{ id: 'o/r', branch: 'feat/b' }]);

    await trackProjects(run, [{ id: 'o/r', branch: 'feat/b' }]);

    expect(await store.project('o/r')).toMatchObject({ branch: 'feat/b', pinned: true });
    expect(fetchFn.calls).toEqual([]);
  });

  it('forgets a repository no longer listed, and leaves out one GitHub does not answer for', async () => {
    const store = await current();
    const { syncing: run } = syncing(store, { routes: {} });

    const unread = await trackProjects(run, [{ id: 'o/private', branch: null }]);

    expect(await store.projects()).toEqual([]);
    expect(unread).toEqual([{ id: 'o/private', error: expect.objectContaining({ status: 404 }) }]);
  });
});

describe('passOver', () => {
  it('settles a proposal whose pull request closed, and keeps one still open', async () => {
    const store = await current();
    await Promise.all([store.saveProposal(proposal(7)), store.saveProposal(proposal(8))]);
    const { syncing: run } = syncing(store, {
      routes: {
        ...unmoved,
        'GET /repos/o/r/pulls/7': () => ({ state: 'closed' }),
        'GET /repos/o/r/pulls/8': () => ({ state: 'open' }),
      },
    });

    await passOver(run, 'o/r', 100);

    expect((await store.proposalsOf('o/r')).map((p) => p.prNumber)).toEqual([8]);
  });

  it('records the error that stopped a pass, and frees the project for the next one', async () => {
    const store = await current();
    const { syncing: run } = syncing(store, { routes: {} });

    const pass = await passOver(run, 'o/r', 100);

    expect(pass.kind).toBe('failed');
    expect(await store.project('o/r')).toMatchObject({
      checkedAt: 100,
      syncError: expect.stringMatching(/Not Found$/),
    });
    expect(await store.claimSync('o/r', 100, 160)).not.toBeNull();
  });

  it('records a failure that is no Error by what it says', async () => {
    const store = await current();
    const { syncing: run } = syncing(store, { routes: {} });
    const failing = {
      ...run,
      reader: { ...run.reader, branchHead: () => Promise.reject('offline') },
    };

    await passOver(failing, 'o/r', 100);

    expect((await store.project('o/r'))?.syncError).toBe('offline');
  });

  it('does not run over a project another pass holds', async () => {
    const store = await current();
    await store.claimSync('o/r', 100, 160);
    const { syncing: run, fetchFn } = syncing(store, { routes: unmoved });

    const pass = await passOver(run, 'o/r', 130);

    expect(pass).toEqual({ kind: 'skipped' });
    expect(fetchFn.calls).toEqual([]);
  });
});

describe('passIfStale', () => {
  it('starts one pass for pages that open together, and none again within two minutes', async () => {
    const store = await current();
    const { syncing: run, fetchFn } = syncing(store, { routes: unmoved });

    const together = await Promise.all([
      passIfStale(run, 'o/r', 100),
      passIfStale(run, 'o/r', 100),
    ]);
    const later = await passIfStale(run, 'o/r', 219);

    expect(together.map((pass) => pass.kind).sort((a, b) => a.localeCompare(b))).toEqual([
      'skipped',
      'synced',
    ]);
    expect(later).toEqual({ kind: 'skipped' });
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('passes over a project whose last pass is more than two minutes old', async () => {
    const store = await current();
    await store.endSync('o/r', { at: 100, error: null });
    const { syncing: run } = syncing(store, { routes: unmoved });

    expect(await passIfStale(run, 'o/r', 221)).toEqual({ kind: 'synced' });
  });

  it('starts no pass for a project Lingua does not hold', async () => {
    const { syncing: run, fetchFn } = syncing(memoryStore(), { routes: unmoved });

    await passIfStale(run, 'x/y', 221);

    expect(fetchFn.calls).toEqual([]);
  });
});
