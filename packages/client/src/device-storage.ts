// The key/value store every per-device preference here lives in: whatever the
// platform provides, plus the JSON read/write around it.

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
const watchers = new Set<() => void>();

/** Install the device store for a platform with no `localStorage` (React
 * Native has none; without this every save here is a silent no-op). Call it
 * once, before the app reads a session. */
export function setSessionStorage(storage: SessionStorage | null): void {
  installed = storage;
  for (const watcher of watchers) watcher();
}

/** Notified whenever the device store is swapped, so anything a module derived
 * from a stored value at evaluation time can derive it again: a native shell
 * installs its store only once the session file has been read, which is after
 * every module has been evaluated. Returns an unsubscribe. */
export function onDeviceStorageChange(listener: () => void): () => void {
  watchers.add(listener);
  return () => watchers.delete(listener);
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

export function readJson(key: string): unknown {
  const raw = storage()?.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled storage non-fatal */
  }
}

const LOCALE_KEY = 'kroma.locale';

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
