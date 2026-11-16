import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitHubFetch, sha } from '#site/github/test-support';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { fakeD1 } from '#site/store/test-support';
import type { Env } from './env';
import { refreshAll, refreshStale } from './scheduled';

const H = vi.hoisted(() => ({ store: null as Store | null }));

vi.mock('./env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./env')>()),
  storeFor: async () => H.store,
}));

const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });

beforeEach(() => {
  H.store = memoryStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const env = (projects: string): Env => ({ LINGUA_DB: fakeD1(), LINGUA_PROJECTS: projects, GITHUB_OAUTH_CLIENT_ID: 'cid', GITHUB_OAUTH_CLIENT_SECRET: 'csecret' });

const branchAt = (head: string) => () => new Response(head, { headers: { etag: `"${head}"` } });

function emptyRepository(repo: string, head: string) {
  return {
    [`GET /repos/${repo}/commits/main`]: branchAt(head),
    [`GET /repos/${repo}/git/trees/${head}?recursive=1`]: () => ({ sha: sha('0e'), truncated: false, tree: [{ path: 'lingua.json', type: 'blob', sha: sha('c') }] }),
    [`GET /${repo}/${head}/lingua.json`]: () => new Response(CONFIG),
  };
}

describe('refreshAll', () => {
  it('holds every listed repository and syncs each one', async () => {
    const fetchFn = gitHubFetch({ routes: { 'GET /repos/o/s': () => ({ default_branch: 'main' }), ...emptyRepository('o/r', sha('a')), ...emptyRepository('o/s', sha('b')) } });

    await refreshAll(env('o/r@main, o/s'), 100, fetchFn);

    expect((await H.store?.projects())?.map((p) => [p.id, p.headSha, p.checkedAt])).toEqual([
      ['o/r', sha('a'), 100],
      ['o/s', sha('b'), 100],
    ]);
  });

  it('stops passing over projects once the run has spent its requests, logging each failed pass', async () => {
    const listed = Array.from({ length: 50 }, (_, i) => `o/r${i}@main`).join(',');
    const fetchFn = gitHubFetch({ routes: {} });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await refreshAll(env(listed), 100, fetchFn);

    expect(fetchFn.calls).toHaveLength(45);
    expect(logged).toHaveBeenCalledWith('lingua: o/r0 did not sync', expect.any(Error));
  });

  it('logs a listed repository GitHub does not answer for', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await refreshAll(env('o/gone'), 100, gitHubFetch({ routes: {} }));

    expect(logged).toHaveBeenCalledWith('lingua: o/gone could not be read', expect.any(Error));
  });

  it('does nothing without a database', async () => {
    const fetchFn = gitHubFetch({ routes: {} });

    await refreshAll({ LINGUA_PROJECTS: 'o/r' }, 100, fetchFn);

    expect(fetchFn.calls).toEqual([]);
  });
});

describe('refreshStale', () => {
  it('passes over a listed project a page opened once its last pass is stale', async () => {
    await H.store?.upsertProject({ id: 'o/r', branch: 'main', pinned: false });
    const fetchFn = gitHubFetch({ routes: emptyRepository('o/r', sha('a')) });

    await refreshStale(env('o/r'), 'o/r', 100, fetchFn);

    expect((await H.store?.project('o/r'))?.headSha).toBe(sha('a'));
  });

  it('does nothing without a database', async () => {
    const fetchFn = gitHubFetch({ routes: {} });

    await refreshStale({}, 'o/r', 100, fetchFn);

    expect(fetchFn.calls).toEqual([]);
  });
});
