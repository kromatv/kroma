import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  dirExists: true,
  fileExists: true,
  text: '{}',
  written: [] as string[],
  created: 0,
  throwOnOpen: false,
  throwOnWrite: false,
  throwOnRead: false,
};

class FakeDirectory {
  constructor(..._parts: unknown[]) {
    if (state.throwOnOpen) throw new Error('no document directory');
  }
  get exists() {
    return state.dirExists;
  }
  create() {
    state.created += 1;
    state.dirExists = true;
  }
}

class FakeFile {
  get exists() {
    return state.fileExists;
  }
  write(body: string) {
    if (state.throwOnWrite) throw new Error('disk full');
    state.written.push(body);
    state.text = body;
    state.fileExists = true;
  }
  textSync() {
    if (state.throwOnRead) throw new Error('unreadable');
    return state.text;
  }
}

vi.mock('expo-file-system', () => ({
  Directory: FakeDirectory,
  File: FakeFile,
  Paths: { document: '/documents' },
}));

const stored = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@kroma/core', () => ({
  setSessionStorage: (s: unknown) => {
    stored.current = s;
  },
}));

const { installDeviceStore } = await import('./deviceStore');

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const install = (): Store => {
  installDeviceStore();
  return stored.current as Store;
};

beforeEach(() => {
  state.dirExists = true;
  state.fileExists = true;
  state.text = '{}';
  state.written = [];
  state.created = 0;
  state.throwOnOpen = false;
  state.throwOnWrite = false;
  state.throwOnRead = false;
  stored.current = null;
});

describe('installDeviceStore', () => {
  it('hands @kroma/core a store that reads what it wrote', () => {
    const store = install();
    expect(store.getItem('kroma:theme')).toBeNull();

    store.setItem('kroma:theme', 'light');
    expect(store.getItem('kroma:theme')).toBe('light');
    expect(JSON.parse(state.written.at(-1) ?? '{}')).toEqual({ 'kroma:theme': 'light' });
  });

  it('forgets a removed key, on disk as well as in memory', () => {
    const store = install();
    store.setItem('kroma:theme', 'dark');
    store.removeItem('kroma:theme');

    expect(store.getItem('kroma:theme')).toBeNull();
    expect(JSON.parse(state.written.at(-1) ?? '{}')).toEqual({});
  });

  it('seeds from the file already on disk', () => {
    state.text = '{"kroma:theme":"dark","other":"x"}';
    const store = install();

    expect(store.getItem('kroma:theme')).toBe('dark');
    expect(store.getItem('other')).toBe('x');
  });

  it('creates the directory and the file when neither is there yet', () => {
    state.dirExists = false;
    state.fileExists = false;
    install();

    expect(state.created).toBe(1);
    expect(state.written).toEqual(['{}']);
  });

  it('starts empty rather than throwing when the file is not JSON', () => {
    state.text = 'not json at all';
    expect(install().getItem('kroma:theme')).toBeNull();
  });

  it('starts empty when the file holds JSON of the wrong shape', () => {
    state.text = '{"kroma:theme":{"nested":true}}';
    expect(install().getItem('kroma:theme')).toBeNull();
  });

  it('starts empty when the file cannot be read', () => {
    state.throwOnRead = true;
    expect(install().getItem('kroma:theme')).toBeNull();
  });

  it('keeps serving from memory when the location is refused', () => {
    state.throwOnOpen = true;
    const store = install();

    store.setItem('kroma:theme', 'light');
    expect(store.getItem('kroma:theme')).toBe('light');
    expect(state.written).toEqual([]);
  });

  it('keeps the value in memory when the write fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.throwOnWrite = true;
    const store = install();

    store.setItem('kroma:theme', 'light');
    expect(store.getItem('kroma:theme')).toBe('light');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
