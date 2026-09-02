import { describe, expect, it } from 'vitest';
import { catalogsByLocale, namespaceOf, parseCatalogPath, sourcesByNamespace } from './layout';

describe('parseCatalogPath', () => {
  it('reads the locale and namespace off a path, with or without the leading dot', () => {
    expect(parseCatalogPath('./en/about.json')).toEqual({ locale: 'en', namespace: 'about' });
    expect(parseCatalogPath('fr/nav.json')).toEqual({ locale: 'fr', namespace: 'nav' });
  });

  it('answers null for anything that is not a catalog file', () => {
    expect(parseCatalogPath('./messages.d.ts')).toBeNull();
    expect(parseCatalogPath('./stray.json')).toBeNull();
    expect(parseCatalogPath('./en/about.ts')).toBeNull();
    expect(parseCatalogPath('./en/deeper/x.json')).toBeNull();
  });
});

describe('catalogsByLocale', () => {
  it('merges every file of a locale into one catalog', () => {
    const catalogs = catalogsByLocale({
      './en/about.json': { 'about.title': 'About' },
      './en/nav.json': { 'nav.home': 'Home' },
      './fr/about.json': { 'about.title': 'À propos' },
      './stray.json': { ignored: 'yes' },
    });

    expect(catalogs).toEqual({
      en: { 'about.title': 'About', 'nav.home': 'Home' },
      fr: { 'about.title': 'À propos' },
    });
  });
});

describe('sourcesByNamespace', () => {
  it('regroups per-file loaders by namespace, then by locale', async () => {
    const en = () => Promise.resolve({ 'admin.title': 'Console' });
    const fr = () => Promise.resolve({ 'admin.title': 'Console (fr)' });

    const sources = sourcesByNamespace({
      './en/admin.json': en,
      './fr/admin.json': fr,
      './en/about.json': () => Promise.resolve({ 'about.title': 'About' }),
    });

    expect(Object.keys(sources).sort()).toEqual(['about', 'admin']);
    expect(sources.admin).toEqual({ en, fr });
    await expect(sources.admin?.fr?.()).resolves.toEqual({ 'admin.title': 'Console (fr)' });
  });
});

describe('namespaceOf', () => {
  it('is the first segment of a key', () => {
    expect(namespaceOf('player.play')).toBe('player');
    expect(namespaceOf('pipeline.t.loudness')).toBe('pipeline');
  });
});
