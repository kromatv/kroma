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

/** The device store this platform is using, or null where there is none.
 * Exported so other per-device state (language, keyboard layout, recent
 * searches) can share it instead of hard-coding `localStorage`. */
export function deviceStorage(provided?: SessionStorage | null): SessionStorage | null {
  if (provided !== undefined) return provided;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readRaw(key: string, storage?: SessionStorage | null): string | null {
  try {
    return deviceStorage(storage)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string | null, storage?: SessionStorage | null): void {
  try {
    if (value === null) deviceStorage(storage)?.removeItem(key);
    else deviceStorage(storage)?.setItem(key, value);
  } catch {}
}

function parseJson(key: string, storage?: SessionStorage | null): unknown {
  const raw = readRaw(key, storage);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The stored value at `key`, or null when it is missing or no longer matches
 * `schema` (a blob written by an older build is dropped, never trusted). */
export function readStored<S extends z.ZodType>(
  key: string,
  schema: S,
  storage?: SessionStorage | null,
): z.output<S> | null {
  const parsed = z.safeParse(schema, parseJson(key, storage));
  return parsed.success ? parsed.data : null;
}

/** The stored array at `key`, keeping only the entries that still parse. */
export function readStoredList<S extends z.ZodType>(
  key: string,
  schema: S,
  storage?: SessionStorage | null,
): z.output<S>[] {
  const value = parseJson(key, storage);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = z.safeParse(schema, entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function writeStored(key: string, value: unknown, storage?: SessionStorage | null): void {
  writeRaw(key, JSON.stringify(value), storage);
}
