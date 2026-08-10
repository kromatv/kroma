import { type SessionStorage, setSessionStorage } from '@kroma/core';
import { afterEach, describe, expect, it } from 'vitest';
import { readThemeMuted, writeThemeMuted } from './theme-audio';

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

afterEach(() => setSessionStorage(null));

describe('the theme mute preference', () => {
  it('round-trips through the device store', () => {
    setSessionStorage(inMemory());
    writeThemeMuted(true);
    expect(readThemeMuted()).toBe(true);
    writeThemeMuted(false);
    expect(readThemeMuted()).toBe(false);
  });

  it('reads as unmuted on a device whose store refuses', () => {
    setSessionStorage(refusing());
    expect(readThemeMuted()).toBe(false);
  });

  it('honours the choice for the session even when it cannot be persisted', () => {
    setSessionStorage(refusing());
    expect(() => writeThemeMuted(true)).not.toThrow();
  });
});
