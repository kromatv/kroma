import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fill, syncSet } from './edit.ts';
import { has, moduleOf, read, removeSets, setOf } from './fixture.ts';
import { lockPath, readCatalogs, readFiles, writeCatalog } from './set.ts';

afterEach(removeSets);

describe('writeCatalog', () => {
  it('keeps the schema pointer a file already has', () => {
    const set = setOf(
      { 'en.json': { $schema: 'https://example.com/a', hello: 'Hello' } },
      { source: 'en' },
      'flat',
    );

    writeCatalog(set, 'en', '', { hello: 'Hi' });

    expect(read(set, 'en.json')).toEqual({ $schema: 'https://example.com/a', hello: 'Hi' });
  });

  it('gives a new language the pointer of the source language', () => {
    const set = setOf(
      { 'en.json': { $schema: 'https://example.com/a', hello: 'Hello' } },
      { source: 'en' },
      'flat',
    );

    writeCatalog(set, 'fr', '', { hello: 'Bonjour' });

    expect(Object.keys(read(set, 'fr.json'))).toEqual(['$schema', 'hello']);
  });
});

const FOLDERS = {
  'locales/en/settings/advanced.json': { 'settings.port': 'Port' },
  'locales/en/nav.json': { 'nav.title': 'Notes', 'nav.back': 'Back' },
  'locales/en/settings.json': { 'settings.title': 'Settings' },
};

describe('the layout of a module', () => {
  it('is one file per language while its locales hold files', () => {
    const set = moduleOf({ 'locales/en.json': { 'nav.title': 'Notes' } });

    expect(set.layout).toBe('flat');
  });

  it('is one file per language before it has any locales', () => {
    expect(moduleOf({}).layout).toBe('flat');
  });

  it('is one folder per language once its locales hold folders', () => {
    expect(moduleOf(FOLDERS).layout).toBe('folder');
  });
});

describe('a module that keeps one folder per language', () => {
  it('is read file by file, a namespace before the files it is split into', () => {
    const set = moduleOf(FOLDERS);

    expect([...readFiles(set, 'en').keys()]).toEqual(['nav', 'settings', 'settings/advanced']);
  });

  it('gets a translation in the file its source keeps the key in', () => {
    const set = moduleOf(FOLDERS);

    fill(set, 'fr', { 'settings.port': 'Port', 'nav.back': 'Retour' });

    expect(read(set, 'fr/settings/advanced.json')).toEqual({ 'settings.port': 'Port' });
    expect(read(set, 'fr/nav.json')).toEqual({ 'nav.back': 'Retour' });
  });

  it('keeps the lock of a language inside its folder', () => {
    const set = moduleOf({ ...FOLDERS, 'locales/fr/nav.json': { 'nav.back': 'Retour' } });

    syncSet(set);

    expect(lockPath(set, 'fr')).toBe(join(set.dir, 'fr', 'i18n.lock'));
    expect(has(set, 'fr/i18n.lock')).toBe(true);
  });
});

describe('readCatalogs', () => {
  it('merges the files of each language into one catalog, in the order they are read', () => {
    const set = moduleOf({ ...FOLDERS, 'locales/fr/nav.json': { 'nav.back': 'Retour' } });
    syncSet(set);

    const catalogs = readCatalogs(set);

    expect(Object.keys(catalogs)).toEqual(['en', 'fr']);
    expect(Object.keys(catalogs.en ?? {})).toEqual([
      'nav.title',
      'nav.back',
      'settings.title',
      'settings.port',
    ]);
  });

  it('gives a module with one file per language that file, key for key', () => {
    const set = moduleOf({ 'locales/en.json': { b: 'B', a: 'A' }, 'locales/fr.json': { a: 'Un' } });

    expect(readCatalogs(set)).toEqual({ en: { b: 'B', a: 'A' }, fr: { a: 'Un' } });
  });
});
