import { z } from 'zod';
import type { User } from '#site/store/store';
import type { AppCredentials } from './app';
import { gitHub } from './client';

const Exchanged = z.union([
  z.object({ access_token: z.string() }),
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

/** Where to send a browser so GitHub asks the person to sign in to the App. */
export function authorizeUrl(app: AppCredentials, redirectUri: string, state: string): string {
  const query = new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, state });
  return `https://github.com/login/oauth/authorize?${query}`;
}

async function exchange(
  app: AppCredentials,
  callback: Callback,
  fetchFn: typeof fetch,
): Promise<string> {
  const response = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'kroma-lingua',
    },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code: callback.code,
      redirect_uri: callback.redirectUri,
    }),
  });
  const exchanged = Exchanged.parse(await response.json());
  if ('error' in exchanged) {
    throw new Error(exchanged.error_description ?? exchanged.error);
  }
  return exchanged.access_token;
}

/**
 * Trade the code GitHub sent back for the account that signed in. The token
 * is used once, to read who it belongs to, and never kept: Lingua writes to
 * repositories as the App, never as the person.
 */
export async function userFromCode(
  app: AppCredentials,
  callback: Callback,
  fetchFn: typeof fetch = fetch,
): Promise<User> {
  const token = await exchange(app, callback, fetchFn);
  const me = await gitHub(`Bearer ${token}`, fetchFn).get('/user', GitHubUser);
  return { id: me.id, login: me.login, name: me.name ?? null, avatarUrl: me.avatar_url ?? null };
}
