// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { type DeviceStore, deviceStore, setDeviceStore } from './device-store';

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

afterEach(() => setDeviceStore(null));

describe('deviceStore', () => {
  it('answers with the installed store, whatever the platform has', () => {
    const store = fake();

    setDeviceStore(store);

    expect(deviceStore()).toBe(store);
  });

  it('falls back to the platform store when nothing is installed', () => {
    setDeviceStore(null);

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
