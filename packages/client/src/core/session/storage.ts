import { z } from 'zod';

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
  if (installed) return installed;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readRaw(key: string): string | null {
  try {
    return deviceStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string | null): void {
  try {
    if (value === null) deviceStorage()?.removeItem(key);
    else deviceStorage()?.setItem(key, value);
  } catch {}
}

function parseJson(key: string): unknown {
  const raw = readRaw(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The stored value at `key`, or null when it is missing or no longer matches
 * `schema` (a blob written by an older build is dropped, never trusted). */
export function readStored<S extends z.ZodType>(key: string, schema: S): z.output<S> | null {
  const parsed = z.safeParse(schema, parseJson(key));
  return parsed.success ? parsed.data : null;
}

/** The stored array at `key`, keeping only the entries that still parse. */
export function readStoredList<S extends z.ZodType>(key: string, schema: S): z.output<S>[] {
  const value = parseJson(key);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = z.safeParse(schema, entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function writeStored(key: string, value: unknown): void {
  writeRaw(key, JSON.stringify(value));
}
