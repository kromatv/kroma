// Client-side session persistence: the ACTIVE session, the accounts that have
// signed in on this device, and the saved KROMA servers (TV is multi-server).
// Multi-server is opt-in per record: a `StoredSession.serverUrl` scopes an
// account to one server, and the single-origin web app never sets it, so the
// de-dupe/forget helpers degrade to "by user id".

import { z } from 'zod';
import { deviceStorage, readJson, writeJson } from './device-storage';
import { User } from './schemas';

export * from './device-storage';
export * from './session-token';

const KEY = 'kroma.session';
const ACCOUNTS_KEY = 'kroma.accounts';
const SERVERS_KEY = 'kroma.servers';
const LEGACY_SERVER_KEY = 'kroma.serverUrl';

export interface StoredSession {
  accessToken: string;
  user: User;
  serverUrl?: string;
}

// Storage is a trust boundary. `id` decides the record: an entry without one is
// junk and is dropped. Every other field falls back rather than failing, so a
// blob written before `User` gained a field survives the upgrade instead of
// signing its account out.
const StoredUser = User.extend({
  email: z.string().catch(''),
  username: z.string().catch(''),
  createdAt: z.string().catch(''),
  hasPin: z.boolean().catch(false),
  permissions: z.array(z.string()).catch([]),
});

const StoredAccount = z.object({
  accessToken: z.string().min(1),
  user: StoredUser,
  serverUrl: z.string().optional(),
});

const StoredServer = z.object({
  url: z.string().min(1),
  name: z.string().nullish(),
  lastUsedAt: z.number().optional(),
});

/** A KROMA server the TV remembers, so it can hold profiles from several at once
 * and order the picker by most-recently-used. */
export interface SavedServer {
  url: string;
  name?: string | null;
  lastUsedAt: number;
}

function storedAccounts(): StoredSession[] {
  const value = readJson(ACCOUNTS_KEY);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = StoredAccount.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function storedServers(): Array<z.infer<typeof StoredServer>> {
  const value = readJson(SERVERS_KEY);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = StoredServer.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Normalize a server origin for comparison (drop trailing slashes). Tolerates
 * null/undefined (TV call sites may pass an unset serverUrl). */
export function normalizeServerUrl(u?: string | null): string {
  return (u ?? '').replace(/(^|[^/])\/+$/, '$1');
}

function scopeOf(a: Pick<StoredSession, 'serverUrl'>): string | null {
  return a.serverUrl ? normalizeServerUrl(a.serverUrl) : null;
}

/** The active session, or null when signed out. */
export function loadSession(): StoredSession | null {
  const parsed = StoredAccount.safeParse(readJson(KEY));
  return parsed.success ? parsed.data : null;
}

/** Set the active session AND remember the account on this device. De-dupes by
 * the (serverUrl, user.id) pair so the same user id on two servers is two
 * distinct profiles; with no serverUrl this is the by-user-id de-dupe web uses. */
export function saveSession(session: StoredSession): void {
  writeJson(KEY, session);
  const scope = scopeOf(session);
  const accounts = loadAccounts().filter(
    (a) => !(a.user.id === session.user.id && scopeOf(a) === scope),
  );
  accounts.unshift(session);
  writeJson(ACCOUNTS_KEY, accounts);
  if (session.serverUrl) touchServer(session.serverUrl);
}

/** Clear only the ACTIVE session (e.g. "switch profile"). Remembered accounts
 * stay, so switching back to one is still password-free. */
export function clearSession(): void {
  try {
    deviceStorage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Accounts that have signed in on this device (most-recent first). Pass a
 * `serverUrl` to get only that server's remembered profiles. */
export function loadAccounts(serverUrl?: string): StoredSession[] {
  const all = storedAccounts();
  if (serverUrl == null) return all;
  const scope = normalizeServerUrl(serverUrl);
  return all.filter((a) => scopeOf(a) === scope);
}

/** Forget one remembered account (full sign-out for it). With a `serverUrl` only
 * the (serverUrl, user.id) pair is dropped; without one, every account with that
 * user id is dropped (web's single-server behaviour). Also clears the active
 * session when it was the one being forgotten. */
export function forgetAccount(userId: string, serverUrl?: string): void {
  const scope = serverUrl != null ? normalizeServerUrl(serverUrl) : null;
  const matches = (a: Pick<StoredSession, 'user' | 'serverUrl'>) =>
    a.user.id === userId && (scope == null || scopeOf(a) === scope);
  writeJson(
    ACCOUNTS_KEY,
    loadAccounts().filter((a) => !matches(a)),
  );
  const active = loadSession();
  if (active && matches(active)) clearSession();
}

/** Saved KROMA servers, most-recently-used first. */
export function loadServers(): SavedServer[] {
  return storedServers()
    .map((s) => ({
      url: normalizeServerUrl(s.url),
      name: s.name ?? null,
      lastUsedAt: s.lastUsedAt ?? 0,
    }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/** Add or update a saved server (idempotent on normalized URL). */
export function saveServer(server: {
  url: string;
  name?: string | null;
  lastUsedAt?: number;
}): SavedServer[] {
  const url = normalizeServerUrl(server.url);
  const existing = storedServers().find((s) => normalizeServerUrl(s.url) === url);
  const list = loadServers().filter((s) => s.url !== url);
  list.unshift({
    url,
    name: server.name ?? existing?.name ?? null,
    lastUsedAt: server.lastUsedAt ?? existing?.lastUsedAt ?? Date.now(),
  });
  writeJson(SERVERS_KEY, list);
  return list;
}

/** Bump a server's `lastUsedAt` (and add it if unknown), for picker ordering. */
export function touchServer(url: string): void {
  saveServer({ url, lastUsedAt: Date.now() });
}

/** Drop a saved server and every remembered account on it; clears the active
 * session if it belonged to that server. */
export function forgetServer(url: string): void {
  const u = normalizeServerUrl(url);
  writeJson(
    SERVERS_KEY,
    loadServers().filter((s) => s.url !== u),
  );
  writeJson(
    ACCOUNTS_KEY,
    loadAccounts().filter((a) => scopeOf(a) !== u),
  );
  const active = loadSession();
  if (active && scopeOf(active) === u) clearSession();
}

/** One-time upgrade from the pre-multi-server storage: seed `kroma.servers` from
 * the old single `kroma.serverUrl`, stamp legacy accounts/session with it, then
 * drop the legacy key. A no-op once migrated or on a fresh (web) install. */
export function migrateStorage(): void {
  const s = deviceStorage();
  if (!s) return;
  let legacy: string | null = null;
  try {
    legacy = s.getItem(LEGACY_SERVER_KEY);
  } catch {
    return;
  }
  if (!legacy) return;
  const url = normalizeServerUrl(legacy);

  if (!s.getItem(SERVERS_KEY)) {
    writeJson(SERVERS_KEY, [{ url, name: null, lastUsedAt: Date.now() }]);
  }
  const accounts = storedAccounts();
  let changed = false;
  for (const a of accounts) {
    if (!a.serverUrl) {
      a.serverUrl = url;
      changed = true;
    }
  }
  if (changed) writeJson(ACCOUNTS_KEY, accounts);
  const active = loadSession();
  if (active && !active.serverUrl) {
    active.serverUrl = url;
    writeJson(KEY, active);
  }
  try {
    s.removeItem(LEGACY_SERVER_KEY);
  } catch {
    /* ignore */
  }
}
