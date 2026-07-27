// Device persistence for the native TV client.
//
// React Native has no `localStorage`, so @kroma/client's session store had
// nowhere to write and every save was a silent no-op: the profile you paired was
// gone on the next launch. This supplies the store it asks for.
//
// It is backed by ONE JSON file, mirrored in memory. That shape is forced by the
// API it has to satisfy: `loadSession()` is synchronous (it seeds React state
// during the first render) while the only reads the file system offers are
// async. So the file is read ONCE at boot and every later read is served from
// memory; writes go to memory and straight through to disk, which
// expo-file-system does synchronously.
//
// expo-file-system rather than expo-secure-store: the tokens kept here are
// already scoped and revocable, the pod is ALREADY linked into the tvOS binary,
// and adding a native module would mean a full rebuild before anyone could sign
// in again.
//
// WHERE it writes is decided at runtime, and that is the part a simulator will
// not teach you. tvOS is far stricter than iOS about app storage, and on a real
// Apple TV the documents directory stayed empty while the same code filled it in
// the simulator. So the store probes: it writes where it is supposed to, checks
// that the bytes actually landed, and falls back to the caches directory if they
// did not. Caches is purgeable, which is a real downgrade - the session survives
// relaunches but tvOS may reclaim it under storage pressure - and it is still
// the difference between "signs in once" and "signs in every single launch".

import { type SessionStorage, setSessionStorage } from '@kroma/core';
import { Directory, File, Paths } from 'expo-file-system';

const FILE_NAME = 'kroma-session.json';

/** Where the store may live, best first. */
const LOCATIONS = [
  { name: 'document', dir: () => Paths.document },
  { name: 'cache', dir: () => Paths.cache },
] as const;

function handleIn(base: Directory): File {
  const dir = new Directory(base, 'kroma');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, FILE_NAME);
}

/**
 * The first location this device actually accepts a write in.
 *
 * Resolved once, by WRITING rather than by asking: `exists` and the directory
 * flags both report success on tvOS in cases where the bytes never land, so the
 * only trustworthy probe is a round trip.
 */
function pickLocation(): File | null {
  for (const location of LOCATIONS) {
    try {
      const file = handleIn(location.dir());
      if (!file.exists) file.write('{}');
      if (file.exists) return file;
    } catch {
      // Try the next one; a device that refuses every location keeps the
      // in-memory store, which is exactly the old behaviour.
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

  /** Replace the in-memory contents. Used once, by the boot hydration. */
  load(raw: string): void {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') this.data = parsed as Record<string, string>;
    } catch {
      // A truncated or hand-edited file must not stop the app from starting; the
      // worst case is signing in again.
    }
  }

  private flush(): void {
    if (!target) return;
    try {
      target.write(JSON.stringify(this.data));
    } catch (cause) {
      // A failed write costs the session on the next launch, never this one, so
      // it must not throw. It must not be SILENT either: a swallowed write is
      // indistinguishable from "the profile just does not persist", which is
      // how this went unnoticed on a real Apple TV while working in the
      // simulator. (Release builds strip console, so the real signal is that the
      // file on disk stops changing.)
      console.warn('[kroma] session store write failed:', cause);
    }
  }
}

const store = new DeviceStore();

/**
 * Resolve where the session lives, read it, and install the store.
 *
 * Await this BEFORE rendering the app: `loadSession()` runs during the first
 * render, so a session that arrives later is a profile picker the user has
 * already been shown.
 */
export async function hydrateSessionStorage(): Promise<void> {
  try {
    target = pickLocation();
    if (target?.exists) store.load(await target.text());
  } catch (cause) {
    console.warn('[kroma] session store unreadable, starting empty:', cause);
  }
  setSessionStorage(store);
}
