import { describe, expect, it } from 'vitest';
import { fakeD1 } from '#site/store/test-support';
import { listedProjects, oauthCredentials, readEnv } from './env';

describe('listedProjects', () => {
  it('reads each repository, and the branch an entry pins, from a comma-separated list', () => {
    const listed = listedProjects({ LINGUA_PROJECTS: 'kromatv/kroma@feat/lingua, o/r' });

    expect(listed).toEqual([
      { id: 'kromatv/kroma', branch: 'feat/lingua' },
      { id: 'o/r', branch: null },
    ]);
  });

  it('skips an entry that names no repository, and keeps the first of two for one repository', () => {
    const listed = listedProjects({ LINGUA_PROJECTS: 'nope, o/r@, @main, a/b@c d, ,o/r@next, o/r' });

    expect(listed).toEqual([{ id: 'o/r', branch: 'next' }]);
  });

  it('lists nothing while the variable is unset', () => {
    expect(listedProjects({})).toEqual([]);
  });
});

describe('readEnv', () => {
  it('keeps the D1 binding and every non-blank string it reads, and nothing else', () => {
    const db = fakeD1();

    const env = readEnv({ LINGUA_DB: db, LINGUA_PROJECTS: 'o/r', GITHUB_OAUTH_CLIENT_ID: ' ', OTHER: 'x', LINGUA_DEV_LOGIN: 7 });

    expect(env).toEqual({ LINGUA_DB: db, LINGUA_PROJECTS: 'o/r' });
  });

  it('ignores a database binding that is not D1', () => {
    expect(readEnv({ LINGUA_DB: { prepare: () => null } })).toEqual({});
  });
});

describe('oauthCredentials', () => {
  it('holds the OAuth App only once its id and secret are both set', () => {
    expect(oauthCredentials({ GITHUB_OAUTH_CLIENT_ID: 'c' })).toBeNull();
    expect(oauthCredentials({ GITHUB_OAUTH_CLIENT_ID: 'c', GITHUB_OAUTH_CLIENT_SECRET: 's' })).toEqual({ clientId: 'c', clientSecret: 's' });
  });
});
