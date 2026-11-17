import { workerContext } from '@kromatv/site-kit/worker-env';
import type { Store, User } from '#site/store/store';
import { type Env, readEnv, storeFor } from './env';
import { report } from './log';
import { refreshStale } from './scheduled';
import { viewerOf } from './session';
import type { Context } from './views';

const DEV_USER_ID = 1;

/** Who is asking: the session's account, or on a local run without D1 the `LINGUA_DEV_LOGIN` stand-in. */
export async function resolveViewer(
  env: Env,
  store: Store,
  asked: { cookies: string | null | undefined; now: number },
): Promise<User | null> {
  if (!env.LINGUA_DB && env.LINGUA_DEV_LOGIN) {
    return { id: DEV_USER_ID, login: env.LINGUA_DEV_LOGIN, name: null, avatarUrl: null };
  }
  return viewerOf(store, asked.cookies, asked.now);
}

/** The request TanStack Start is serving: the Worker's bindings, the origin it came to, and its cookies. */
export async function servedRequest(): Promise<{
  env: Env;
  origin: string;
  cookies: string | null;
}> {
  const { getRequest } = await import('@tanstack/react-start/server');
  const { env } = await workerContext();
  const request = getRequest();
  return {
    env: readEnv(env),
    origin: new URL(request.url).origin,
    cookies: request.headers.get('cookie'),
  };
}

/** The context a server function computes a page from, read off the request TanStack Start is serving. */
export async function requestContext(): Promise<Context> {
  const { env, cookies } = await servedRequest();
  const store = await storeFor(env);
  const viewer = await resolveViewer(env, store, { cookies, now: Math.floor(Date.now() / 1000) });
  return { env, store, viewer };
}

/** Once the page is served, pass over project `id` if its last pass is stale: the page never waits on GitHub. */
export async function refreshAfterServing(id: string): Promise<void> {
  const { env, waitUntil } = await workerContext();
  const pass = refreshStale(readEnv(env), id, { now: Math.floor(Date.now() / 1000) });
  waitUntil(pass.catch((error: unknown) => report(`${id} did not refresh`, error)));
}
