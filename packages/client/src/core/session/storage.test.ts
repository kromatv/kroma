import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { deviceStorage, loadLocalePref, saveLocalePref, setSessionStorage } from '.';
import { onDeviceStorageChange, readStored, readStoredList, writeStored } from './storage';
import { MemStorage } from './storage.fixture';

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

describe('watching for the device store', () => {
  afterEach(() => setSessionStorage(null));

  it('tells a watcher the store was swapped, so it can derive its value again', () => {
    const watcher = vi.fn();

    onDeviceStorageChange(watcher);
    setSessionStorage({ getItem: () => null, setItem() {}, removeItem() {} });

    expect(watcher).toHaveBeenCalledTimes(1);
  });

  it('hears nothing more once it has unsubscribed', () => {
    const watcher = vi.fn();

    onDeviceStorageChange(watcher)();
    setSessionStorage(null);

    expect(watcher).not.toHaveBeenCalled();
  });
});

describe('reading a stored value', () => {
  const Row = z.object({ id: z.string() });

  it('drops a blob an older build wrote in a shape that no longer parses', () => {
    writeStored('probe', { id: 42 });

    expect(readStored('probe', Row)).toBeNull();
  });

  it('answers null for a key nothing wrote, and for one holding broken JSON', () => {
    (globalThis as { localStorage: Storage }).localStorage.setItem('broken', '{');

    expect(readStored('missing', Row)).toBeNull();
    expect(readStored('broken', Row)).toBeNull();
  });

  it('keeps the entries of a list that still parse and drops the rest', () => {
    writeStored('rows', [{ id: 'a' }, { id: 7 }, { id: 'b' }]);

    expect(readStoredList('rows', Row)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('reads a key holding something that is not a list at all as empty', () => {
    writeStored('rows', { id: 'a' });

    expect(readStoredList('rows', Row)).toEqual([]);
  });
});
