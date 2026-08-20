import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deviceStorage, loadLocalePref, saveLocalePref, setSessionStorage } from './device-storage';
import { MemStorage } from './device-storage.fixture';

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('deviceStorage', () => {
  afterEach(() => setSessionStorage(null));

  it('hands out the installed store, the browser one, or null where there is neither', () => {
    expect(deviceStorage()).toBe((globalThis as { localStorage: Storage }).localStorage);
    const custom = { getItem: () => null, setItem() {}, removeItem() {} };
    setSessionStorage(custom);
    expect(deviceStorage()).toBe(custom);
    setSessionStorage(null);
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(deviceStorage()).toBeNull();
  });
});

describe('locale preference', () => {
  it('persists and clears the device locale', () => {
    expect(loadLocalePref()).toBeNull();
    saveLocalePref('en');
    expect(loadLocalePref()).toBe('en');
    saveLocalePref(null);
    expect(loadLocalePref()).toBeNull();
  });
});
