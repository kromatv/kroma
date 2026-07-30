// Client-side session persistence: the ACTIVE session, the accounts that have
// signed in on this device (Netflix-style instant switch-back), and the saved
// KROMA servers (TV is multi-server). Multi-server is opt-in per record: a
// `StoredSession.serverUrl` scopes an account to one server, and the
// single-origin web app never sets it, so the de-dupe/forget helpers degrade
// to "by user id". Guarded by `typeof` so it's a no-op off-DOM (SSR / native).

import type { User } from './types';

const KEY = 'kroma.session';
const ACCOUNTS_KEY = 'kroma.accounts';
const SERVERS_KEY = 'kroma.servers';
const LEGACY_SERVER_KEY = 'kroma.serverUrl';
const LOCALE_KEY = 'kroma.locale';

export interface StoredSession {
  accessToken: string;
  user: User;
  serverUrl?: string;
}

// The short-lived bearer obtained by exchanging the access token. Kept in
// memory only (never persisted) so a stolen localStorage dump can't be
// replayed as a live session.
let memorySessionToken: string | undefined;

/** The current in-memory session bearer, or undefined when not (yet) exchanged. */
export function sessionToken(): string | undefined {
  return memorySessionToken;
}

/** Set (or clear, with `undefined`) the in-memory session bearer. */
export function setSessionToken(token: string | undefined): void {
  memorySessionToken = token;
}

// A reload starts from only the persisted access token; several parts of the
// app then each want to exchange it (auth provider, data layer, a mid-session
// 401), which uncoordinated would fire several concurrent POST /auth/token
// calls. This coalesces overlapping exchanges into one in-flight request.

/** The shape returned by a session-token exchange (`KromaClient.exchangeToken`). */
export interface TokenExchange<U = unknown> {
  token: string;
  user: U;
}

let inflightExchange: Promise<TokenExchange> | null = null;

/** Run `exchange` unless one is already in flight, in which case share it. Only
 * for the no-PIN boot/refresh exchange (a PIN-gated switch-in is a distinct user
 * action and must not coalesce with the ambient boot exchange). */
export function sharedTokenExchange<U>(
  exchange: () => Promise<TokenExchange<U>>,
): Promise<TokenExchange<U>> {
  if (inflightExchange) return inflightExchange as Promise<TokenExchange<U>>;
  const p = exchange().finally(() => {
    if (inflightExchange === p) inflightExchange = null;
  });
  inflightExchange = p as Promise<TokenExchange>;
  return p;
}

/** A KROMA server the TV remembers, so it can hold profiles from several at once
 * and order the picker by most-recently-used. */
export interface SavedServer {
  url: string;
  name?: string | null;
  lastUsedAt: number;
}

/**
 * The key/value store sessions live in. Only the three methods used here are
 * required, so a client can supply anything: the browsers pass `localStorage`
 * (the default), and the native apps pass their own device store.
 */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let installed: SessionStorage | null = null;

/** Install the device store for a platform with no `localStorage` (React
 * Native has none; without this every save here is a silent no-op). Call it
 * once, before the app reads a session. */
export function setSessionStorage(storage: SessionStorage | null): void {
  installed = storage;
}

/** The device store this platform is using, or null where there is none.
 * Exported so other per-device state (language, keyboard layout, recent
 * searches) can share it instead of hard-coding `localStorage`. */
export function deviceStorage(): SessionStorage | null {
  return storage();
}

function storage(): SessionStorage | null {
  if (installed) return installed;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Access to localStorage can throw (privacy mode / sandboxed iframe).
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = storage()?.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled storage non-fatal */
  }
}

/** Normalize a server origin for comparison (drop trailing slashes). Tolerates
 * null/undefined (TV call sites may pass an unset serverUrl). */
export function normalizeServerUrl(u?: string | null): string {
  return (u ?? '').replace(/(^|[^/])\/+$/, '$1');
}

/** The server scope of a stored account, normalized, or `null` (web / legacy). */
function scopeOf(a: Pick<StoredSession, 'serverUrl'>): string | null {
  return a.serverUrl ? normalizeServerUrl(a.serverUrl) : null;
}

/** The active session, or null when signed out. */
export function loadSession(): StoredSession | null {
  const s = readJson<StoredSession | null>(KEY, null);
  return s?.accessToken && s.user ? s : null;
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
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Accounts that have signed in on this device (most-recent first). Pass a
 * `serverUrl` to get only that server's remembered profiles. */
export function loadAccounts(serverUrl?: string): StoredSession[] {
  const all = readJson<StoredSession[]>(ACCOUNTS_KEY, []).filter((a) => a?.accessToken && a?.user);
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
  return readJson<SavedServer[]>(SERVERS_KEY, [])
    .filter((s) => s?.url)
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
  const existing = readJson<SavedServer[]>(SERVERS_KEY, []).find(
    (s) => normalizeServerUrl(s.url) === url,
  );
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
  const s = storage();
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
  const accounts = readJson<StoredSession[]>(ACCOUNTS_KEY, []);
  let changed = false;
  for (const a of accounts) {
    if (a && !a.serverUrl) {
      a.serverUrl = url;
      changed = true;
    }
  }
  if (changed) writeJson(ACCOUNTS_KEY, accounts);
  const active = readJson<StoredSession | null>(KEY, null);
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

/** The device-level UI locale override (what the user last picked on THIS
 * device), or null. Used before sign-in and as a fallback when the account has
 * no preference. */
export function loadLocalePref(): string | null {
  try {
    return storage()?.getItem(LOCALE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Persist (or clear, with `null`) the device-level UI locale override. */
export function saveLocalePref(locale: string | null): void {
  try {
    if (locale) storage()?.setItem(LOCALE_KEY, locale);
    else storage()?.removeItem(LOCALE_KEY);
  } catch {
    /* quota / disabled storage non-fatal */
  }
}
