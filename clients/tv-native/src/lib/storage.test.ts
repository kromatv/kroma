// Where the native TV client keeps its session.
//
// React Native has no localStorage, so the shared session store had nowhere to
// write and every save was a silent no-op: the profile you paired was gone on
// the next launch. This is the store it asks for - and the interesting part is
// not the reading and writing, it is WHERE.
//
// tvOS is far stricter than iOS about app storage, and on a real Apple TV the
// documents directory stayed empty while the same code filled it in the
// simulator. `exists` and the directory flags both reported success. So the
// location is resolved by WRITING and checking the bytes landed, and falling
// back to caches when they did not - purgeable, a real downgrade, and still the
// difference between "signs in once" and "signs in every single launch".
//
// That is the failure this file exists to keep fixed, and it is invisible to any
// test that trusts what the file system reports. So the fake below can lie the
// way tvOS lies: accept the write, report success, and keep nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeFile {
  exists: boolean;
  contents: string | null;
  write(data: string): void;
  text(): Promise<string>;
}

const fs = vi.hoisted(() => ({
  // Directories whose writes never land, however they report.
  lying: new Set<string>(),
  // Directories that throw on any access at all.
  refusing: new Set<string>(),
  failing: new Set<string>(),
  unreadable: new Set<string>(),
  files: new Map<string, FakeFile>(),
  created: [] as string[],
  writes: [] as Array<{ dir: string; data: string }>,
}));

vi.mock('expo-file-system', () => {
  class Directory {
    readonly path: string;
    constructor(base: { path: string } | string, name?: string) {
      const root = typeof base === 'string' ? base : base.path;
      this.path = name ? `${root}/${name}` : root;
      if (fs.refusing.has(root)) throw new Error(`no access to ${root}`);
    }
    get exists() {
      return fs.created.includes(this.path);
    }
    create() {
      fs.created.push(this.path);
    }
  }

  class File {
    readonly dir: string;
    readonly key: string;
    constructor(directory: { path: string }, name: string) {
      this.dir = directory.path;
      this.key = `${directory.path}/${name}`;
    }
    get exists() {
      return fs.files.has(this.key);
    }
    write(data: string) {
      if (fs.failing.has(this.dir)) throw new Error(`cannot write to ${this.dir}`);
      fs.writes.push({ dir: this.dir, data });
      // The tvOS lie: the call succeeds and nothing is kept.
      if (fs.lying.has(this.dir)) return;
      fs.files.set(this.key, {
        exists: true,
        contents: data,
        write: () => undefined,
        text: async () => data,
      });
    }
    async text() {
      if (fs.unreadable.has(this.dir)) throw new Error(`cannot read ${this.key}`);
      const file = fs.files.get(this.key);
      if (!file) throw new Error(`no such file: ${this.key}`);
      return file.contents ?? '';
    }
  }

  return { Directory, File, Paths: { document: '/documents', cache: '/caches' } };
});

const setSessionStorage = vi.hoisted(() => vi.fn());
vi.mock('@kroma/core', () => ({ setSessionStorage }));

// The store is a module-scope singleton - one per process, as one launch has -
// so each case re-imports the module. Without that, a key written by an earlier
// test is still in memory for the next, and "starts empty" passes or fails on
// whatever ran before it.
async function launch(): Promise<void> {
  vi.resetModules();
  const { hydrateSessionStorage } = await import('./storage');
  await hydrateSessionStorage();
}

const DOC = '/documents/kroma';
const CACHE = '/caches/kroma';
const FILE = 'kroma-session.json';

function store() {
  const installed = setSessionStorage.mock.calls.at(-1)?.[0];
  if (!installed) throw new Error('no session store was installed');
  return installed as {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

const onDisk = (dir: string) => {
  const raw = fs.files.get(`${dir}/${FILE}`)?.contents;
  return raw == null ? null : (JSON.parse(raw) as Record<string, string>);
};

beforeEach(() => {
  fs.lying.clear();
  fs.refusing.clear();
  fs.failing.clear();
  fs.unreadable.clear();
  fs.files.clear();
  fs.created = [];
  fs.writes = [];
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('choosing where to write', () => {
  it('uses the documents directory when the bytes land', async () => {
    await launch();
    store().setItem('session', 'abc');
    expect(onDisk(DOC)).toEqual({ session: 'abc' });
  });

  it('creates the folder it needs', async () => {
    await launch();
    expect(fs.created).toContain(DOC);
  });

  it('leaves a folder that is already there alone', async () => {
    await launch();
    await launch();
    expect(fs.created.filter((path) => path === DOC)).toHaveLength(1);
  });

  it('FALLS BACK to caches when a write reports success and keeps nothing', async () => {
    // Exactly what a real Apple TV did while the simulator worked.
    fs.lying.add(DOC);
    await launch();
    store().setItem('session', 'abc');

    expect(onDisk(DOC)).toBeNull();
    expect(onDisk(CACHE)).toEqual({ session: 'abc' });
  });

  it('falls back when the first location refuses outright', async () => {
    fs.refusing.add('/documents');
    await launch();
    store().setItem('session', 'abc');
    expect(onDisk(CACHE)).toEqual({ session: 'abc' });
  });

  it('probes by WRITING, not by asking', async () => {
    await launch();
    // `exists` and the directory flags both report success on tvOS in cases
    // where nothing lands, so a round trip is the only trustworthy answer.
    expect(fs.writes.some((w) => w.dir === DOC && w.data === '{}')).toBe(true);
  });

  it('does not clobber a session that is already there', async () => {
    fs.files.set(`${DOC}/${FILE}`, {
      exists: true,
      contents: '{"session":"kept"}',
      write: () => undefined,
      text: async () => '{"session":"kept"}',
    });
    await launch();
    // The probe writes `{}` only when there is no file; writing it regardless
    // signs the user out on every launch, which is the bug it was added to fix.
    expect(store().getItem('session')).toBe('kept');
  });
});

describe('a device that accepts nothing', () => {
  it('still installs a store, so the app starts', async () => {
    fs.refusing.add('/documents');
    fs.refusing.add('/caches');
    await launch();
    // The old behaviour: in memory only. Signing in every launch beats not
    // starting.
    expect(setSessionStorage).toHaveBeenCalledOnce();
    expect(() => store().setItem('session', 'abc')).not.toThrow();
    expect(store().getItem('session')).toBe('abc');
  });

  it('keeps working for the rest of the session', async () => {
    fs.refusing.add('/documents');
    fs.refusing.add('/caches');
    await launch();
    store().setItem('a', '1');
    store().setItem('b', '2');
    expect(store().getItem('a')).toBe('1');
    expect(store().getItem('b')).toBe('2');
  });
});

describe('reading what was there', () => {
  it('seeds from the file at boot', async () => {
    fs.files.set(`${DOC}/${FILE}`, {
      exists: true,
      contents: '{"session":"abc","server":"https://attic"}',
      write: () => undefined,
      text: async () => '{"session":"abc","server":"https://attic"}',
    });
    await launch();

    // `loadSession()` is synchronous - it seeds React state during the first
    // render - so everything has to be in memory before the app mounts.
    expect(store().getItem('session')).toBe('abc');
    expect(store().getItem('server')).toBe('https://attic');
  });

  it('starts empty rather than failing on a truncated file', async () => {
    fs.files.set(`${DOC}/${FILE}`, {
      exists: true,
      contents: '{"session":"ab',
      write: () => undefined,
      text: async () => '{"session":"ab',
    });
    await launch();
    // The worst case is signing in again; refusing to start is not a worse
    // case, it is a different product.
    expect(store().getItem('session')).toBeNull();
    expect(setSessionStorage).toHaveBeenCalledOnce();
  });

  it('ignores a file holding something that is not an object', async () => {
    fs.files.set(`${DOC}/${FILE}`, {
      exists: true,
      contents: '"just a string"',
      write: () => undefined,
      text: async () => '"just a string"',
    });
    await launch();
    expect(store().getItem('session')).toBeNull();
  });

  it('starts empty, and says so, when the file cannot be read back', async () => {
    fs.files.set(`${DOC}/${FILE}`, {
      exists: true,
      contents: '{"session":"abc"}',
      write: () => undefined,
      text: async () => '{"session":"abc"}',
    });
    fs.unreadable.add(DOC);
    await launch();

    expect(store().getItem('session')).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[kroma] session store unreadable, starting empty:',
      expect.any(Error),
    );
    expect(setSessionStorage).toHaveBeenCalledOnce();
  });

  it('reports nothing for a key it does not hold', async () => {
    await launch();
    // null, not undefined: the shared session store checks for null.
    expect(store().getItem('nope')).toBeNull();
  });
});

describe('writing', () => {
  it('keeps memory and disk in step', async () => {
    await launch();
    store().setItem('session', 'abc');
    expect(store().getItem('session')).toBe('abc');
    expect(onDisk(DOC)).toEqual({ session: 'abc' });
  });

  it('removes from both', async () => {
    await launch();
    store().setItem('session', 'abc');
    store().removeItem('session');
    expect(store().getItem('session')).toBeNull();
    expect(onDisk(DOC)).toEqual({});
  });

  it('does not throw when the write fails, and does not do it silently', async () => {
    await launch();
    fs.failing.add(DOC);
    // A failed write costs the NEXT launch's session, never this one, so it must
    expect(() => store().setItem('session', 'abc')).not.toThrow();
    expect(store().getItem('session')).toBe('abc');
    expect(console.warn).toHaveBeenCalledWith(
      '[kroma] session store write failed:',
      expect.any(Error),
    );
  });
});
