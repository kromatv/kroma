import { describe, expect, it } from 'vitest';
import { authorizeUrl, grantFromCode, userFromCode } from './oauth';
import { gitHubFetch } from './test-support';

const OAUTH = { clientId: 'cid', clientSecret: 'secret' };
const CALLBACK = { code: 'c', redirectUri: 'https://lingua.test/auth/callback' };

function gitHubAnswering(token: unknown, user: unknown = { id: 42, login: 'ada' }) {
  return gitHubFetch({
    routes: { 'POST /login/oauth/access_token': () => token, 'GET /user': () => user },
  });
}

describe('authorizeUrl', () => {
  it('asks for the public profile alone unless a scope is named', () => {
    const url = new URL(authorizeUrl(OAUTH, { redirectUri: CALLBACK.redirectUri, state: 's' }));

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: CALLBACK.redirectUri,
      state: 's',
    });
  });

  it('asks the named account for the named scope', () => {
    const url = new URL(
      authorizeUrl(OAUTH, {
        redirectUri: CALLBACK.redirectUri,
        state: 's',
        scope: 'public_repo',
        login: 'ada',
      }),
    );

    expect([url.searchParams.get('scope'), url.searchParams.get('login')]).toEqual([
      'public_repo',
      'ada',
    ]);
  });
});

describe('grantFromCode', () => {
  it('reads the account and every scope it granted', async () => {
    const fetchFn = gitHubAnswering(
      { access_token: 'gho_x', scope: 'public_repo,read:user' },
      { id: 42, login: 'ada', name: 'Ada', avatar_url: 'https://a.test/ada.png' },
    );

    const granted = await grantFromCode(OAUTH, CALLBACK, fetchFn);

    expect(granted.scopes).toEqual(['public_repo', 'read:user']);
    expect(granted.user).toEqual({
      id: 42,
      login: 'ada',
      name: 'Ada',
      avatarUrl: 'https://a.test/ada.png',
    });
  });

  it('refuses a code GitHub would not trade, with GitHub’s description', async () => {
    const fetchFn = gitHubAnswering({
      error: 'bad_verification_code',
      error_description: 'The code is wrong.',
    });

    await expect(grantFromCode(OAUTH, CALLBACK, fetchFn)).rejects.toThrow('The code is wrong.');
  });

  it('refuses with the error name when GitHub gave no description', async () => {
    const fetchFn = gitHubAnswering({ error: 'incorrect_client_credentials' });

    await expect(grantFromCode(OAUTH, CALLBACK, fetchFn)).rejects.toThrow(
      'incorrect_client_credentials',
    );
  });
});

describe('userFromCode', () => {
  it('reads who signed in, with no name or avatar when GitHub has none', async () => {
    const fetchFn = gitHubAnswering({ access_token: 'gho_x' });

    expect(await userFromCode(OAUTH, CALLBACK, fetchFn)).toEqual({
      id: 42,
      login: 'ada',
      name: null,
      avatarUrl: null,
    });
  });
});
