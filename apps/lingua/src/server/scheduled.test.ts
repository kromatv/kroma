import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { gitHubFetch, testApp } from '#site/github/test-support';
import { fakeD1 } from '#site/store/test-support';
import type { Env } from './env';
import { refreshAll } from './scheduled';

let env: Env;

beforeAll(() => {
  const app = testApp();
  env = { GITHUB_APP_ID: app.appId, GITHUB_APP_PRIVATE_KEY: app.privateKey, GITHUB_WEBHOOK_SECRET: app.webhookSecret };
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LATER = () => new Date(Date.now() + 3_600_000).toISOString();

describe('refreshAll', () => {
  it('discovers the repositories of every installation of the App', async () => {
    const fetchFn = gitHubFetch({
      routes: {
        'GET /app/installations?per_page=100': () => [{ id: 7 }],
        'POST /app/installations/7/access_tokens': () => ({ token: 'ghs_x', expires_at: LATER() }),
        'GET /installation/repositories?per_page=100': () => ({ repositories: [] }),
      },
    });
    vi.stubGlobal('fetch', fetchFn);

    await refreshAll({ ...env, LINGUA_DB: fakeD1() }, 5);

    expect(fetchFn.calls.map((c) => c.path)).toContain('/installation/repositories?per_page=100');
  });

  it('logs an installation that did not sync and carries on', async () => {
    vi.stubGlobal('fetch', gitHubFetch({ routes: { 'GET /app/installations?per_page=100': () => [{ id: 8 }] } }));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await refreshAll({ ...env, LINGUA_DB: fakeD1() }, 5);

    expect(logged).toHaveBeenCalledWith('lingua: installation 8 did not sync', expect.any(Error));
  });

  it('does nothing without a database or before the App is connected', async () => {
    const fetchFn = gitHubFetch({ routes: {} });
    vi.stubGlobal('fetch', fetchFn);

    await refreshAll(env, 5);
    await refreshAll({ LINGUA_DB: fakeD1() }, 5);

    expect(fetchFn.calls).toEqual([]);
  });
});
