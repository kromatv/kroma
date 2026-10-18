// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { type DeviceStore, deviceStore } from './device-store';

function fake(): DeviceStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

describe('deviceStore', () => {
  it('keeps simultaneous root stores independent', () => {
    const first = fake();
    const second = fake();
    deviceStore(first)?.setItem('quality', 'high');
    expect(deviceStore(first)?.getItem('quality')).toBe('high');
    expect(deviceStore(second)?.getItem('quality')).toBeNull();
  });

  it('answers with the installed store, whatever the platform has', () => {
    const store = fake();

    expect(deviceStore(store)).toBe(store);
  });

  it('falls back to the platform store when nothing is installed', () => {
    expect(deviceStore()).toBe(globalThis.localStorage);
  });

  it('is null where the platform has no store either', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });

    const answer = deviceStore();

    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    expect(answer).toBeNull();
  });

  it('is null when reading the platform store throws, as a sandbox makes it', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    const answer = deviceStore();

    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    expect(answer).toBeNull();
  });
});
