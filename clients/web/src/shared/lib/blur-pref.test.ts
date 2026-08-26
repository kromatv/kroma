import { afterEach, describe, expect, it, vi } from 'vitest';

const setFrostEnabled = vi.hoisted(() => vi.fn());
vi.mock('@kroma/ui/kit', () => ({ setFrostEnabled }));

const KEY = 'kroma:blur';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    _map: m,
  };
}

// The module pushes at import, so each case loads it fresh under its own store.
async function load(storage: unknown) {
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  setFrostEnabled.mockClear();
  return import('./blur-pref');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the device blur preference', () => {
  it('blurs unless the device turned it off', async () => {
    expect((await load(fakeStorage())).getBlurPref()).toBe(true);
    expect((await load(fakeStorage({ [KEY]: 'off' }))).getBlurPref()).toBe(false);
  });

  it('pushes the stored choice into the kit at import, before the first paint', async () => {
    await load(fakeStorage({ [KEY]: 'off' }));
    expect(setFrostEnabled).toHaveBeenCalledWith(false);
  });

  it('reaches the kit on a write, so a surface already drawn hears it', async () => {
    const store = fakeStorage();
    const { setBlurPref } = await load(store);
    setFrostEnabled.mockClear();

    setBlurPref(false);
    expect(store._map.get(KEY)).toBe('off');
    expect(setFrostEnabled).toHaveBeenCalledWith(false);
  });

  it('holds for the session where the write cannot land', async () => {
    const { setBlurPref } = await load({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    setFrostEnabled.mockClear();

    expect(() => setBlurPref(false)).not.toThrow();
    expect(setFrostEnabled).toHaveBeenCalledWith(false);
  });

  it('blurs when storage cannot be read at all', async () => {
    const { getBlurPref } = await load({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
    });
    expect(getBlurPref()).toBe(true);
  });
});
