import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  catalogLayout,
  completeLocales,
  keysByFile,
  scanCatalogs,
  TYPES_FILE,
  writeCatalogTypes,
} from './folder.ts';

const dirs: string[] = [];

function folder(files: Record<string, object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-catalogs-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, JSON.stringify(content));
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TWO = {
  'i18n.json': { source: 'fr' },
  'en/about.json': { 'about.title': 'About' },
  'fr/about.json': { 'about.title': 'À propos' },
  'en/admin.json': { 'admin.title': 'Console' },
  'fr/admin.json': { 'admin.title': 'Console' },
};

const byPath = (a: { locale: string; file: string }, b: typeof a) =>
  `${a.locale}/${a.file}`.localeCompare(`${b.locale}/${b.file}`);

describe('scanCatalogs', () => {
  it('lists every file under a locale folder and nothing at the top level', () => {
    const dir = folder({ ...TWO, 'stray.json': {} });

    expect(scanCatalogs(dir).sort(byPath)).toEqual([
      { locale: 'en', namespace: 'about', file: 'about' },
      { locale: 'en', namespace: 'admin', file: 'admin' },
      { locale: 'fr', namespace: 'about', file: 'about' },
      { locale: 'fr', namespace: 'admin', file: 'admin' },
    ]);
  });

  it('finds the files a namespace is split into, however deep', () => {
    const dir = folder({
      'i18n.json': { source: 'fr' },
      'fr/admin/users.json': {},
      'fr/admin/sign-in/providers.json': {},
    });

    expect(scanCatalogs(dir).map((at) => [at.namespace, at.file])).toEqual([
      ['admin', 'admin/sign-in/providers'],
      ['admin', 'admin/users'],
    ]);
  });
});

describe('catalogLayout', () => {
  it('is a folder layout once the directory holds a folder, whatever lies beside it', () => {
    const dir = folder({ 'en/nav.json': {}, 'notes.json': {} });

    expect(catalogLayout(dir)).toBe('folder');
  });

  it('is flat for one file per locale, and for a directory nobody made yet', () => {
    const dir = folder({ 'en.json': {}, 'fr.json': {} });

    expect([catalogLayout(dir), catalogLayout(join(dir, 'missing'))]).toEqual(['flat', 'flat']);
  });
});

describe('keysByFile', () => {
  it('reads each catalog file its keys from one locale', () => {
    const dir = folder(TWO);

    expect([...keysByFile(dir, 'fr').entries()].sort()).toEqual([
      ['about', ['about.title']],
      ['admin', ['admin.title']],
    ]);
  });
});

describe('writeCatalogTypes', () => {
  it('writes the declaration once and leaves it alone while nothing moved', () => {
    const dir = folder(TWO);

    const first = writeCatalogTypes(dir);
    const second = writeCatalogTypes(dir);

    expect([first.changed, second.changed]).toEqual([true, false]);
    const text = readFileSync(join(dir, TYPES_FILE), 'utf8');
    expect(text).toContain("'admin.title': {};");
    expect(text).toContain("locale: 'en' | 'fr';");
  });

  it('rewrites the declaration when a message appears in the source language', () => {
    const dir = folder(TWO);
    writeCatalogTypes(dir);

    writeFileSync(join(dir, 'fr/nav.json'), JSON.stringify({ 'nav.back': 'Retour à {page}' }));
    const again = writeCatalogTypes(dir);

    expect(again.changed).toBe(true);
    expect(readFileSync(again.path, 'utf8')).toContain("'nav.back': { page: V };");
  });

  it('leaves the declaration alone when another language gains a message', () => {
    const dir = folder(TWO);
    writeCatalogTypes(dir);

    writeFileSync(join(dir, 'en/nav.json'), JSON.stringify({ 'nav.back': 'Back' }));

    expect(writeCatalogTypes(dir).changed).toBe(false);
  });

  it('refuses a folder with no project file, naming it', () => {
    const dir = folder({ 'fr/about.json': {} });

    expect(() => writeCatalogTypes(dir)).toThrow('i18n.json');
  });

  it('refuses a source language that has no folder', () => {
    const dir = folder({ 'i18n.json': { source: 'de' }, 'fr/about.json': {} });

    expect(() => writeCatalogTypes(dir)).toThrow('"de"');
  });
});

describe('completeLocales', () => {
  it('names the source language and every locale that answers all of its messages', () => {
    const dir = folder({
      'i18n.json': { source: 'fr' },
      'fr/cart.json': { 'cart.items': '{count} articles', 'cart.items_one': 'Un article' },
      'en/cart.json': { 'cart.items': '{count} items' },
      'de/cart.json': {},
    });

    expect(completeLocales(dir, 'cart', scanCatalogs(dir), 'fr').sort()).toEqual(['en', 'fr']);
  });
});
