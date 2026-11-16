import { beforeAll, describe, expect, it } from 'vitest';
import { type AppCredentials, asInstallation } from './app';
import { gitHubFetch, testApp } from './test-support';

let app: AppCredentials;

beforeAll(() => {
  app = testApp();
}, 60_000);

function gitHubMinting(installationId: number, lifetimeMs: number) {
  const route = `POST /app/installations/${installationId}/access_tokens`;
  return gitHubFetch({
    routes: {
      [route]: () => ({
        token: 'ghs_x',
        expires_at: new Date(Date.now() + lifetimeMs).toISOString(),
      }),
    },
  });
}

const mints = (fetchFn: ReturnType<typeof gitHubFetch>) =>
  fetchFn.calls.filter((c) => c.path.endsWith('/access_tokens')).length;

describe('asInstallation', () => {
  it('mints an installation token once and reuses it while it lives', async () => {
    const fetchFn = gitHubMinting(101, 60 * 60_000);

    await asInstallation(app, 101, fetchFn);
    await asInstallation(app, 101, fetchFn);

    expect(mints(fetchFn)).toBe(1);
  });

  it('mints a fresh token once the held one has five minutes left', async () => {
    const fetchFn = gitHubMinting(102, 60_000);

    await asInstallation(app, 102, fetchFn);
    await asInstallation(app, 102, fetchFn);

    expect(mints(fetchFn)).toBe(2);
  });
});
