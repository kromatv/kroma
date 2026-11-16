import type { OAuthCredentials } from '#site/github/oauth';
import type { ListedProject } from '#site/github/pass';
import { D1Store } from '#site/store/d1-store';
import type { D1Database } from '#site/store/d1-work-store';
import type { Store } from '#site/store/store';

/**
 * The Worker's bindings. The OAuth App's id and secret are `wrangler secret`s:
 * they sign people in, and authenticate every read of a repository.
 * `LINGUA_PROJECTS` is a variable naming the repositories to translate.
 */
/** The Worker itself, through a service binding: a call starts a new invocation with its own request budget. */
export interface SelfBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface Env {
  LINGUA_DB?: D1Database;
  SELF?: SelfBinding;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  LINGUA_DEV_LOGIN?: string;
  LINGUA_PROJECTS?: string;
}

const STRINGS = [
  'GITHUB_OAUTH_CLIENT_ID',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'LINGUA_DEV_LOGIN',
  'LINGUA_PROJECTS',
] as const;

function isSelf(value: unknown): value is SelfBinding {
  return typeof value === 'object' && value !== null && 'fetch' in value && typeof value.fetch === 'function';
}

function isD1(value: unknown): value is D1Database {
  return typeof value === 'object' && value !== null && 'prepare' in value && 'batch' in value;
}

/** The bindings Lingua reads, picked off whatever the runtime handed over. */
export function readEnv(raw: Readonly<Record<string, unknown>>): Env {
  const env: Env = {};
  if (isD1(raw.LINGUA_DB)) env.LINGUA_DB = raw.LINGUA_DB;
  if (isSelf(raw.SELF)) env.SELF = raw.SELF;
  for (const name of STRINGS) {
    const value = raw[name];
    if (typeof value === 'string' && value.trim() !== '') env[name] = value;
  }
  return env;
}

/** The OAuth App people sign in through, or null until both of its secrets are set. */
export function oauthCredentials(env: Env): OAuthCredentials | null {
  const { GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET } = env;
  if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET) {
    return null;
  }
  return { clientId: GITHUB_OAUTH_CLIENT_ID, clientSecret: GITHUB_OAUTH_CLIENT_SECRET };
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

const ENTRY = /^([\w.-]+\/[\w.-]+)(?:@([\w./-]+))?$/;

/**
 * The repositories `LINGUA_PROJECTS` lists, comma separated: `owner/repo`
 * tracks the repository's default branch, `owner/repo@branch` that branch. An
 * entry that is neither is skipped, and a repository listed twice keeps its first entry.
 */
export function listedProjects(env: Env): ListedProject[] {
  const listed = new Map<string, ListedProject>();
  for (const entry of (env.LINGUA_PROJECTS ?? '').split(',')) {
    const [, id, branch] = ENTRY.exec(entry.trim()) ?? [];
    if (id && !listed.has(id)) listed.set(id, { id, branch: branch ?? null });
  }
  return [...listed.values()];
}
