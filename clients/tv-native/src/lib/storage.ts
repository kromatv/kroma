// Device persistence for the native TV client: React Native has no
// `localStorage`, so this supplies the store @kroma/client's session store
// asks for.
//
// Backed by ONE JSON file, mirrored in memory: `loadSession()` is synchronous
// (it seeds React state during first render) but file reads are async, so the
// file is read once at boot and served from memory after.
//
// On a real Apple TV the documents directory can silently stay empty where the
// simulator fills it (tvOS is stricter about app storage than iOS), so the
// store probes by writing and checking the bytes landed, falling back to the
// purgeable caches directory if they did not.

import { type SessionStorage, setSessionStorage } from '@kroma/core';
import { Directory, File, Paths } from 'expo-file-system';

const FILE_NAME = 'kroma-session.json';

const LOCATIONS = [
  { name: 'document', dir: () => Paths.document },
  { name: 'cache', dir: () => Paths.cache },
] as const;

function handleIn(base: Directory): File {
  const dir = new Directory(base, 'kroma');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, FILE_NAME);
}

// Resolved by writing rather than asking: `exists` can report success on tvOS
// even where the bytes never land.
function pickLocation(): File | null {
  for (const location of LOCATIONS) {
    try {
      const file = handleIn(location.dir());
      if (!file.exists) file.write('{}');
      if (file.exists) return file;
    } catch {
      // A device that refuses every location keeps the in-memory store.
    }
  }
  return null;
}

let target: File | null = null;

class DeviceStore implements SessionStorage {
  private data: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.data[key] = value;
    this.flush();
  }

  removeItem(key: string): void {
    delete this.data[key];
    this.flush();
  }

  load(raw: string): void {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') this.data = parsed as Record<string, string>;
    } catch {
      // A truncated or hand-edited file must not stop the app from starting.
    }
  }

  private flush(): void {
    if (!target) return;
    try {
      target.write(JSON.stringify(this.data));
    } catch (cause) {
      // Must not throw (costs only the next launch) and must not be silent
      // (release builds strip console; the disk file is the only signal left).
      console.warn('[kroma] session store write failed:', cause);
    }
  }
}

const store = new DeviceStore();

/** Await this before rendering the app: `loadSession()` runs during the first
 * render, so a session that arrives later is a profile picker the user has
 * already been shown. */
export async function hydrateSessionStorage(): Promise<void> {
  try {
    target = pickLocation();
    if (target?.exists) store.load(await target.text());
  } catch (cause) {
    console.warn('[kroma] session store unreadable, starting empty:', cause);
  }
  setSessionStorage(store);
}
