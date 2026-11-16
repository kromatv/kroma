import { describe, expect, it } from 'vitest';
import { fakeD1 } from '#site/store/test-support';
import { appCredentials, installUrl, oauthCredentials, readEnv, trackedBranches } from './env';

describe('trackedBranches', () => {
  it('reads one branch per repository from a comma-separated list', () => {
    const branches = trackedBranches({ LINGUA_BRANCHES: 'kromatv/kroma=feat/lingua, o/r=next' });

    expect([...branches]).toEqual([
      ['kromatv/kroma', 'feat/lingua'],
      ['o/r', 'next'],
    ]);
  });

  it('ignores an entry that does not name a repository and a branch', () => {
    expect(trackedBranches({ LINGUA_BRANCHES: 'nope, o/r=, =main, a/b=c d' }).size).toBe(0);
    expect(trackedBranches({}).size).toBe(0);
  });
});

describe('readEnv', () => {
  it('keeps the D1 binding and every non-blank secret, and nothing else', () => {
    const db = fakeD1();

    const env = readEnv({ LINGUA_DB: db, GITHUB_APP_ID: '1', GITHUB_APP_SLUG: ' ', OTHER: 'x', LINGUA_DEV_LOGIN: 7 });

    expect(env).toEqual({ LINGUA_DB: db, GITHUB_APP_ID: '1' });
  });

  it('ignores a database binding that is not D1', () => {
    expect(readEnv({ LINGUA_DB: { prepare: () => null } })).toEqual({});
  });
});

describe('credentials', () => {
  it('holds the App only once its id, key and webhook secret are all set', () => {
    const partial = appCredentials({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'k' });
    const whole = appCredentials({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'a\\nb', GITHUB_WEBHOOK_SECRET: 's' });

    expect(partial).toBeNull();
    expect(whole).toEqual({ appId: '1', privateKey: 'a\nb', webhookSecret: 's' });
  });

  it('holds the OAuth App only once its id and secret are both set', () => {
    expect(oauthCredentials({ GITHUB_OAUTH_CLIENT_ID: 'c' })).toBeNull();
    expect(oauthCredentials({ GITHUB_OAUTH_CLIENT_ID: 'c', GITHUB_OAUTH_CLIENT_SECRET: 's' })).toEqual({ clientId: 'c', clientSecret: 's' });
  });

  it('links to the App’s install page once its slug is known', () => {
    expect(installUrl({ GITHUB_APP_SLUG: 'lingua' })).toBe('https://github.com/apps/lingua/installations/new');
    expect(installUrl({})).toBeNull();
  });
});
