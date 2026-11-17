import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gitHubFetch, sha } from '#site/github/test-support';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { fakeD1 } from '#site/store/test-support';
import type { Env } from './env';
import { syncNow } from './sync-now';

const H = vi.hoisted(() => ({ store: null as Store | null }));

vi.mock('./env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./env')>()),
  storeFor: async () => H.store,
}));

const CONFIG = JSON.stringify({ projects: [{ path: 'loc' }] });

beforeEach(() => {
  H.store = memoryStore();
});

const env = (projects: string): Env => ({ LINGUA_DB: fakeD1(), LINGUA_PROJECTS: projects });

const repository = gitHubFetch({
  routes: {
    'GET /repos/o/r/commits/main': () =>
      new Response(sha('a'), { headers: { etag: `"${sha('a')}"` } }),
    [`GET /repos/o/r/git/trees/${sha('a')}?recursive=1`]: () => ({
      sha: sha('0e'),
      truncated: false,
      tree: [{ path: 'lingua.json', type: 'blob', sha: sha('c') }],
    }),
    [`GET /o/r/${sha('a')}/lingua.json`]: () => new Response(CONFIG),
  },
});

describe('syncNow', () => {
  it('reads a listed repository that was never read, and says it is up to date', async () => {
    const result = await syncNow(env('o/r@main'), { project: 'o/r' }, 100, repository);

    expect(result).toMatchObject({
      status: 200,
      repository: { id: 'o/r', branch: 'main', checkedAt: 100, sync: { kind: 'current' } },
    });
  });

  it('refuses a repository the deployment does not list', async () => {
    const result = await syncNow(env('o/r@main'), { project: 'o/x' }, 100, repository);

    expect(result).toEqual({ status: 404, error: 'Lingua does not translate this repository' });
  });

  it('says a sync is already running when another pass holds the repository', async () => {
    await syncNow(env('o/r@main'), { project: 'o/r' }, 100, repository);
    await H.store?.claimSync('o/r', 200, 500);

    const result = await syncNow(env('o/r@main'), { project: 'o/r' }, 210, repository);

    expect(result.status).toBe(409);
  });

  it('needs a database', async () => {
    const result = await syncNow(
      { LINGUA_PROJECTS: 'o/r@main' },
      { project: 'o/r' },
      100,
      repository,
    );

    expect(result.status).toBe(503);
  });
});
