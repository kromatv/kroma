import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { deviceStorage, loadLocalePref, saveLocalePref } from '.';
import { readStored, readStoredList, writeStored } from './storage';
import { MemStorage } from './storage.fixture';

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('deviceStorage', () => {
  it('hands out the installed store, the browser one, or null where there is neither', () => {
    expect(deviceStorage()).toBe((globalThis as { localStorage: Storage }).localStorage);
    const custom = { getItem: () => null, setItem() {}, removeItem() {} };
    expect(deviceStorage(custom)).toBe(custom);
    expect(deviceStorage(null)).toBeNull();
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

describe('explicit storage roots', () => {
  it('keeps two backends and the browser store independent', () => {
    const a = new MemStorage();
    const b = new MemStorage();
    saveLocalePref('en', a);
    saveLocalePref('fr', b);
    expect(loadLocalePref(a)).toBe('en');
    expect(loadLocalePref(b)).toBe('fr');
    expect(loadLocalePref()).toBeNull();
  });
  it('treats an explicitly unavailable backend as unavailable', () => {
    saveLocalePref('en');
    expect(loadLocalePref(null)).toBeNull();
    expect(deviceStorage(null)).toBeNull();
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
