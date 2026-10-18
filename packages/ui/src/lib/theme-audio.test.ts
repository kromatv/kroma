import type { SessionStorage } from '@kromatv/client';
import { describe, expect, it } from 'vitest';
import { readThemeMuted as readMuted, writeThemeMuted as writeMuted } from './theme-audio';

function refusing(): SessionStorage {
  const no = () => {
    throw new Error('this device has no store');
  };
  return { getItem: no, setItem: no, removeItem: no };
}

function inMemory(): SessionStorage {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
  };
}

describe('the theme mute preference', () => {
  it('round-trips through the device store', () => {
    const backend = inMemory();
    writeMuted(true, backend);
    expect(readMuted(backend)).toBe(true);
    writeMuted(false, backend);
    expect(readMuted(backend)).toBe(false);
  });

  it('reads as unmuted on a device whose store refuses', () => {
    const backend = refusing();
    expect(readMuted(backend)).toBe(false);
  });

  it('honours the choice for the session even when it cannot be persisted', () => {
    const backend = refusing();
    expect(() => writeMuted(true, backend)).not.toThrow();
  });
});
