import { hasUnresolvedRef, SCHEMA_KEY } from '@kroma/i18n';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import en from './en.json';
import fr from './fr.json';

const CATEGORY = /_(zero|one|two|few|many|other)$/;
const NOT_A_MESSAGE = new Set<string>([SCHEMA_KEY]);
const catalogs = { fr, en } as Record<string, Record<string, string>>;

function baseKeys(catalog: Record<string, string>): string[] {
  return Object.keys(catalog).filter((k) => !CATEGORY.test(k) && !NOT_A_MESSAGE.has(k));
}

function stemOf(key: string): string {
  const stem = key.replace(CATEGORY, '');
  return stem.includes('_') ? stem.slice(0, stem.lastIndexOf('_')) : stem;
}

describe('the shipped catalogs', () => {
  it('says the same things in every language', () => {
    const enKeys = new Set(baseKeys(en));
    const frKeys = new Set(baseKeys(fr));

    expect(baseKeys(fr).filter((k) => !enKeys.has(k))).toEqual([]);
    expect(baseKeys(en).filter((k) => !frKeys.has(k))).toEqual([]);
  });

  it('backs every plural variant with a base key in the same language', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const orphans = Object.keys(catalog)
        .filter((k) => CATEGORY.test(k))
        .filter((k) => catalog[stemOf(k)] === undefined);

      expect(orphans, locale).toEqual([]);
    }
  });

  it('resolves every $t() reference it writes', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const dangling = Object.keys(catalog).filter((key) =>
        hasUnresolvedRef(i18n.translate(locale as 'fr', key as 'lang.fr')),
      );

      expect(dangling, locale).toEqual([]);
    }
  });
});
