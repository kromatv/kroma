import { z } from 'zod';
import type { User } from '#site/store/store';
import { type GitHub, gitHub } from './client';

/** The OAuth App people sign in through and grant a send to. Both values are `wrangler secret`s. */
export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

const Exchanged = z.union([
  z.object({ access_token: z.string(), scope: z.string().default('') }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

const GitHubUser = z.object({
  id: z.number(),
  login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/),
  name: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
});

/** What GitHub sent back to `/auth/callback`, and the address it was sent to. */
export interface Callback {
  code: string;
  redirectUri: string;
}

/** What to ask GitHub for: where to return, the state tying the answer to this browser, and any scope beyond the public profile. */
export interface Asking {
  redirectUri: string;
  state: string;
  scope?: string;
  login?: string;
}

/** An account that answered GitHub's prompt: who it is, the scopes it granted, and a client speaking as it. */
export interface Granted {
  user: User;
  scopes: string[];
  gh: GitHub;
}

/** Where to send a browser so GitHub asks the person to sign in, or to grant `scope` to the account `login`. */
export function authorizeUrl(oauth: OAuthCredentials, asking: Asking): string {
  const { redirectUri, state, scope, login } = asking;
  const query = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: redirectUri,
    state,
    ...(scope ? { scope } : {}),
    ...(login ? { login } : {}),
  });
  return `https://github.com/login/oauth/authorize?${query}`;
}

async function exchange(
  oauth: OAuthCredentials,
  callback: Callback,
  fetchFn: typeof fetch,
): Promise<{ token: string; scopes: string[] }> {
  const response = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'kroma-lingua',
    },
    body: JSON.stringify({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      code: callback.code,
      redirect_uri: callback.redirectUri,
    }),
  });
  const exchanged = Exchanged.parse(await response.json());
  if ('error' in exchanged) {
    throw new Error(exchanged.error_description ?? exchanged.error);
  }
  const scopes = exchanged.scope.split(',').filter((scope) => scope !== '');
  return { token: exchanged.access_token, scopes };
}

/**
 * Trade the code GitHub sent back for the account that answered and a client
 * speaking as it. The token lives in that client alone: whoever holds it
 * drops it when the request ends, and Lingua never stores it.
 */
export async function grantFromCode(
  oauth: OAuthCredentials,
  callback: Callback,
  fetchFn: typeof fetch = fetch,
): Promise<Granted> {
  const { token, scopes } = await exchange(oauth, callback, fetchFn);
  const gh = gitHub(`Bearer ${token}`, fetchFn);
  const me = await gh.get('/user', GitHubUser);
  const user = {
    id: me.id,
    login: me.login,
    name: me.name ?? null,
    avatarUrl: me.avatar_url ?? null,
  };
  return { user, scopes, gh };
}

/** Trade the code GitHub sent back for the account that signed in, reading who it is once. */
export async function userFromCode(
  oauth: OAuthCredentials,
  callback: Callback,
  fetchFn: typeof fetch = fetch,
): Promise<User> {
  return (await grantFromCode(oauth, callback, fetchFn)).user;
}
