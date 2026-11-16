import type { AppCredentials } from '#site/github/app';
import { type D1Database, D1Store } from '#site/store/d1-store';
import type { Store } from '#site/store/store';

/** The Worker's bindings. The GitHub values are `wrangler secret`s; until they are set Lingua is read-only. */
export interface Env {
  LINGUA_DB?: D1Database;
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  LINGUA_DEV_LOGIN?: string;
}

const STRINGS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_WEBHOOK_SECRET',
  'LINGUA_DEV_LOGIN',
] as const;

function isD1(value: unknown): value is D1Database {
  return typeof value === 'object' && value !== null && 'prepare' in value && 'batch' in value;
}

/** The bindings Lingua reads, picked off whatever the runtime handed over. */
export function readEnv(raw: Readonly<Record<string, unknown>>): Env {
  const env: Env = {};
  if (isD1(raw.LINGUA_DB)) env.LINGUA_DB = raw.LINGUA_DB;
  for (const name of STRINGS) {
    const value = raw[name];
    if (typeof value === 'string' && value.trim() !== '') env[name] = value;
  }
  return env;
}

/** The GitHub App this deployment acts as, or null until every secret is set. */
export function credentials(env: Env): AppCredentials | null {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET } = env;
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_WEBHOOK_SECRET) {
    return null;
  }
  return {
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    webhookSecret: GITHUB_WEBHOOK_SECRET,
  };
}

/** Where a repository owner installs the App, once its slug is known. */
export function installUrl(env: Env): string | null {
  return env.GITHUB_APP_SLUG ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new` : null;
}

let local: Promise<Store> | undefined;

/** The deployment's store: D1 when bound, else the in-memory one a local `vite dev` seeds from the checkout. */
export async function storeFor(env: Env): Promise<Store> {
  if (env.LINGUA_DB) {
    return new D1Store(env.LINGUA_DB);
  }
  local ??= import('./dev-store').then(({ devStore }) => devStore());
  return local;
}
