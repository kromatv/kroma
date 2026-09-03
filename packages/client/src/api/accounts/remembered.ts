import { z } from 'zod';
import {
  deviceStorage,
  readStored,
  readStoredList,
  writeRaw,
  writeStored,
} from '../../core/session';
import type { UserId } from './ids';
import { User } from './schemas';

const KEY = 'kroma.session';
const ACCOUNTS_KEY = 'kroma.accounts';
const SERVERS_KEY = 'kroma.servers';
const LEGACY_SERVER_KEY = 'kroma.serverUrl';

const StoredUser = User.extend({
  email: z.string().catch(''),
  username: z.string().catch(''),
  createdAt: z.string().catch(''),
  hasPin: z.boolean().catch(false),
  permissions: z.array(z.string()).catch([]),
});

const StoredSession = z.object({
  accessToken: z.string().min(1),
  user: StoredUser,
  serverUrl: z.string().optional(),
});
export type StoredSession = z.infer<typeof StoredSession>;

const StoredServer = z.object({
  url: z.string().min(1),
  name: z.string().nullish(),
  lastUsedAt: z.number().optional(),
});

/** A KROMA server the TV remembers, so it can hold profiles from several at once
 * and order the picker by most-recently-used. The stored row's gaps are filled
 * in on the way out, so a reader never has to. */
export const SavedServer = StoredServer.extend({
  name: z.string().nullable(),
  lastUsedAt: z.number(),
});
export type SavedServer = z.infer<typeof SavedServer>;

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
  return readStored(KEY, StoredSession);
}

/** Set the active session AND remember the account on this device. De-dupes by
 * the (serverUrl, user.id) pair so the same user id on two servers is two
 * distinct profiles; with no serverUrl this is the by-user-id de-dupe web uses. */
export function saveSession(session: StoredSession): void {
  writeStored(KEY, session);
  const scope = scopeOf(session);
  const accounts = loadAccounts().filter(
    (a) => !(a.user.id === session.user.id && scopeOf(a) === scope),
  );
  accounts.unshift(session);
  writeStored(ACCOUNTS_KEY, accounts);
  if (session.serverUrl) touchServer(session.serverUrl);
}

/** Clear only the ACTIVE session (e.g. "switch profile"). Remembered accounts
 * stay, so switching back to one is still password-free. */
export function clearSession(): void {
  writeRaw(KEY, null);
}

/** Accounts that have signed in on this device (most-recent first). Pass a
 * `serverUrl` to get only that server's remembered profiles. */
export function loadAccounts(serverUrl?: string): StoredSession[] {
  const all = readStoredList(ACCOUNTS_KEY, StoredSession);
  if (serverUrl == null) return all;
  const scope = normalizeServerUrl(serverUrl);
  return all.filter((a) => scopeOf(a) === scope);
}

/** Forget one remembered account (full sign-out for it). With a `serverUrl` only
 * the (serverUrl, user.id) pair is dropped; without one, every account with that
 * user id is dropped (web's single-server behaviour). Also clears the active
 * session when it was the one being forgotten. */
export function forgetAccount(userId: UserId, serverUrl?: string): void {
  const scope = serverUrl != null ? normalizeServerUrl(serverUrl) : null;
  const matches = (a: Pick<StoredSession, 'user' | 'serverUrl'>) =>
    a.user.id === userId && (scope == null || scopeOf(a) === scope);
  writeStored(
    ACCOUNTS_KEY,
    loadAccounts().filter((a) => !matches(a)),
  );
  const active = loadSession();
  if (active && matches(active)) clearSession();
}

/** Saved KROMA servers, most-recently-used first. */
export function loadServers(): SavedServer[] {
  return readStoredList(SERVERS_KEY, StoredServer)
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
  const existing = loadServers().find((s) => s.url === url);
  const list = loadServers().filter((s) => s.url !== url);
  list.unshift({
    url,
    name: server.name ?? existing?.name ?? null,
    lastUsedAt: server.lastUsedAt ?? existing?.lastUsedAt ?? Date.now(),
  });
  writeStored(SERVERS_KEY, list);
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
  writeStored(
    SERVERS_KEY,
    loadServers().filter((s) => s.url !== u),
  );
  writeStored(
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
  const store = deviceStorage();
  if (!store) return;
  let legacy: string | null = null;
  try {
    legacy = store.getItem(LEGACY_SERVER_KEY);
  } catch {
    return;
  }
  if (!legacy) return;
  const url = normalizeServerUrl(legacy);

  if (!store.getItem(SERVERS_KEY)) {
    writeStored(SERVERS_KEY, [{ url, name: null, lastUsedAt: Date.now() }]);
  }
  const accounts = readStoredList(ACCOUNTS_KEY, StoredSession);
  let changed = false;
  for (const a of accounts) {
    if (!a.serverUrl) {
      a.serverUrl = url;
      changed = true;
    }
  }
  if (changed) writeStored(ACCOUNTS_KEY, accounts);
  const active = loadSession();
  if (active && !active.serverUrl) {
    active.serverUrl = url;
    writeStored(KEY, active);
  }
  writeRaw(LEGACY_SERVER_KEY, null);
}
