// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { artworkSetting } from './registry';
import {
  ARTWORK_SCALE,
  ArtworkPrefProvider,
  createArtworkPref,
  createPerfHudPref,
  reactivePref,
  useStoredPref,
} from './store';

// jsdom ships no Storage implementation, so this test provides one rather than
// skipping the assertion that the store actually persists to it.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, String(v));
  removeItem = (k: string) => void this.data.delete(k);
  clear = () => this.data.clear();
  key = (i: number) => [...this.data.keys()][i] ?? null;
  get length() {
    return this.data.size;
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
});

describe('reactivePref', () => {
  it('reads the stored value and treats unknown ones as the fallback', () => {
    window.localStorage.setItem('kroma:test-read', 'b');
    expect(reactivePref('kroma:test-read', ['a', 'b'], 'a').get()).toBe('b');
    window.localStorage.setItem('kroma:test-junk', 'junk');
    expect(reactivePref('kroma:test-junk', ['a', 'b'], 'a').get()).toBe('a');
  });

  it('set persists, updates the snapshot and notifies each subscriber once', () => {
    const pref = reactivePref('kroma:test-set', ['x', 'y'], 'x');
    const seen = vi.fn();
    const off = pref.subscribe(seen);

    pref.set('y');
    expect(pref.get()).toBe('y');
    expect(window.localStorage.getItem('kroma:test-set')).toBe('y');
    expect(seen).toHaveBeenCalledTimes(1);

    pref.set('y'); // same-value write: no notification
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    pref.set('x'); // unsubscribed: silent
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('reads a value stored after the pref was created', () => {
    const pref = reactivePref('kroma:test-late', ['a', 'b'], 'a');
    expect(pref.get()).toBe('a');

    window.localStorage.setItem('kroma:test-late', 'b');

    expect(pref.get()).toBe('b');
  });

  it('keeps a value set here even when the write could not land', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {},
      },
      configurable: true,
    });
    const pref = reactivePref('kroma:test-blocked', ['a', 'b'], 'a');

    expect(() => pref.set('b')).not.toThrow();

    expect(pref.get()).toBe('b');
  });

  it('useStoredPref re-renders the consumer when ANY writer sets the pref', () => {
    const pref = reactivePref('kroma:test-hook', ['x', 'y'], 'x');
    const { result } = renderHook(() => useStoredPref(pref));
    expect(result.current[0]).toBe('x');

    act(() => pref.set('y')); // an external writer, not the hook's own setter
    expect(result.current[0]).toBe('y');

    act(() => result.current[1]('x'));
    expect(result.current[0]).toBe('x');
    expect(pref.get()).toBe('x');
  });
});

describe('the artwork quality row', () => {
  // The row and `applyArtworkScale` have to be looking at ONE store: the scale
  // is read when a URL is minted, so a row writing somewhere else would move
  // the setting and change no artwork.
  it('reads and writes the store the scale is applied from', () => {
    const use = (
      artworkSetting as unknown as { useValue: () => readonly [string, (v: string) => void] }
    ).useValue;
    const artworkPrefStore = createArtworkPref();
    const { result } = renderHook(() => use(), {
      wrapper: ({ children }) =>
        createElement(ArtworkPrefProvider, { value: artworkPrefStore }, children),
    });
    expect(result.current[0]).toBe(artworkPrefStore.get());

    act(() => result.current[1]('medium'));
    expect(artworkPrefStore.get()).toBe('medium');
    expect(result.current[0]).toBe('medium');

    act(() => result.current[1]('full'));
    expect(artworkPrefStore.get()).toBe('full');
  });
});

describe('the artwork default', () => {
  const reporting = (gb: number | null) => ({
    cpuCores: () => 4,
    memoryBytes: () => (gb === null ? null : gb * 1024 ** 3),
    freeMemoryBytes: () => null,
  });

  const boot = async (gb: number | null) => {
    vi.resetModules();
    const hardware = await import('#tv/app/clientHardware');
    const { readClientHardware } = await import('#tv/app/hardwareReadings');
    vi.spyOn(hardware, 'clientHardware').mockImplementation(() =>
      readClientHardware(reporting(gb)),
    );
    const store = await import('./store');
    return { hardware, store };
  };

  it('stays full on a set that reports enough memory', async () => {
    const { store } = await boot(4);

    expect(store.createArtworkPref().get()).toBe('full');
    expect(ARTWORK_SCALE[store.createArtworkPref().get()]).toBe(1);
  });

  it('steps down to high on a set that reports the low-memory ceiling or less', async () => {
    const { store } = await boot(2);

    expect(store.createArtworkPref().get()).toBe('high');
    expect(ARTWORK_SCALE[store.createArtworkPref().get()]).toBe(0.75);
  });

  it('stays full where the set will not report its memory at all', async () => {
    const { store } = await boot(null);

    expect(store.createArtworkPref().get()).toBe('full');
  });

  it('is beaten by the quality the viewer chose', async () => {
    window.localStorage.setItem('kroma:artwork', 'full');

    const { store } = await boot(2);

    expect(store.createArtworkPref().get()).toBe('full');
    window.localStorage.removeItem('kroma:artwork');
  });

  it('probes the immutable hardware adapter once for the default', async () => {
    const { store, hardware } = await boot(2);
    const before = vi.mocked(hardware.clientHardware).mock.calls.length;
    expect(store.createArtworkPref().get()).toBe('high');
    expect(store.createArtworkPref().get()).toBe('high');
    expect(vi.mocked(hardware.clientHardware).mock.calls).toHaveLength(before);
  });
});

describe('a preference stored by an earlier run', () => {
  it('is what the next module evaluation reads, not the fallback', async () => {
    createPerfHudPref().set('on');

    vi.resetModules();
    const next = await import('./store');

    expect(next.createPerfHudPref().get()).toBe('on');
  });

  it('reads the hydrated artwork backend when the root is created', async () => {
    vi.resetModules();
    const store = await import('./store');
    const late = new Map([['kroma:artwork', 'medium']]);
    expect(ARTWORK_SCALE[store.createArtworkPref().get()]).toBe(1);

    const backend = {
      getItem: (k: string) => late.get(k) ?? null,
      setItem: (k: string, v: string) => void late.set(k, v),
      removeItem: (k: string) => void late.delete(k),
    };

    expect(ARTWORK_SCALE[store.createArtworkPref(backend).get()]).toBe(0.5);
  });
});
