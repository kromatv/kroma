// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { artworkSetting } from './registry';
import { artworkPrefStore, reactivePref, useStoredPref } from './store';

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
    const { result } = renderHook(() => use());
    expect(result.current[0]).toBe(artworkPrefStore.get());

    act(() => result.current[1]('medium'));
    expect(artworkPrefStore.get()).toBe('medium');
    expect(result.current[0]).toBe('medium');

    act(() => result.current[1]('full'));
    expect(artworkPrefStore.get()).toBe('full');
  });
});
