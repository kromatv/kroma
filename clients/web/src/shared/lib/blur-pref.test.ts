// @vitest-environment jsdom

import { useFrostCoat } from '@kromatv/ui/kit';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlurPreferenceProvider, getBlurPref, useBlurPreference } from './blur-pref';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  vi.stubGlobal('localStorage', store);
  return { store, values };
}
function usePreferenceAndCoat() {
  return { pref: useBlurPreference(), coat: useFrostCoat(null) };
}
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('root-owned blur preferences', () => {
  it('reads the saved choice, with blur enabled by default', () => {
    storage();
    expect(getBlurPref()).toBe(true);
    storage({ 'kroma:blur': 'off' });
    expect(getBlurPref()).toBe(false);
  });
  it('renders the saved choice immediately and updates existing coats', () => {
    const { values } = storage({ 'kroma:blur': 'off' });
    const root = renderHook(usePreferenceAndCoat, { wrapper: BlurPreferenceProvider });
    expect(root.result.current.coat.style).toBeNull();
    act(() => root.result.current.pref[1](true));
    expect(values.get('kroma:blur')).toBe('on');
    expect(root.result.current.coat.style).not.toBeNull();
    root.unmount();
  });
  it('keeps a changed choice when persistence fails, without changing a different root', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    const a = renderHook(usePreferenceAndCoat, { wrapper: BlurPreferenceProvider });
    const b = renderHook(usePreferenceAndCoat, { wrapper: BlurPreferenceProvider });
    act(() => a.result.current.pref[1](false));
    expect(a.result.current.coat.style).toBeNull();
    expect(b.result.current.coat.style).not.toBeNull();
    a.unmount();
    expect(b.result.current.pref[0]).toBe(true);
    b.unmount();
  });
  it('uses blur when storage cannot be read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(getBlurPref()).toBe(true);
  });
});
