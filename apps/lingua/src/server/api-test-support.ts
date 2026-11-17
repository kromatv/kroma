import type { Store } from '#site/store/store';
import { api } from './api';
import type { Env } from './env';
import { openSession } from './session';
import { ada } from './test-support';

/** The origin every route test asks from. */
export const ORIGIN = 'https://lingua.test';

/** A deployment with its OAuth App set and one repository listed. */
export const env: Env = {
  GITHUB_OAUTH_CLIENT_ID: 'cid',
  GITHUB_OAUTH_CLIENT_SECRET: 'csecret',
  LINGUA_PROJECTS: 'o/r',
};

/** The `Set-Cookie` values an answer carries. */
export const cookiesOf = (response: Response | null) => response?.headers.getSetCookie() ?? [];

/** Ask the Worker's routes for `path`, on the deployment `on`. */
export const get = (path: string, init: RequestInit = {}, on: Env = env) =>
  api(new Request(`${ORIGIN}${path}`, init), on);

/**
 * How a route test asks as the signed-in contributor, over the store `held`
 * returns, on the deployment `on`: `signedIn` is their session cookie, and
 * `send` a same-origin JSON body carrying it.
 */
export function asking(held: () => Store, on: Env = env) {
  async function signedIn(): Promise<string> {
    const set = await openSession(held(), ada, Math.floor(Date.now() / 1000));
    return set.split(';')[0] ?? '';
  }

  async function send(method: string, path: string, body: unknown): Promise<Response | null> {
    const headers = {
      origin: ORIGIN,
      cookie: await signedIn(),
      'content-type': 'application/json',
    };
    const sent = typeof body === 'string' ? body : JSON.stringify(body);
    return get(path, { method, headers, body: sent }, on);
  }

  return { signedIn, send };
}
