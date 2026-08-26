import { describe, expect, it } from 'vitest';
import { createLocales } from './locales';

const locales = createLocales({ en: 'English', fr: 'Français' }, 'en');

describe('createLocales', () => {
  it('identifies the supported locales', () => {
    expect(locales.isLocale('en')).toBe(true);
    expect(locales.isLocale('fr')).toBe(true);
    expect(locales.isLocale('de')).toBe(false);
  });

  it('normalizes both a BCP 47 tag and a native display name', () => {
    expect(locales.normalizeLocale('en-US')).toBe('en');
    expect(locales.normalizeLocale('fr')).toBe('fr');
    expect(locales.normalizeLocale('English')).toBe('en');
    expect(locales.normalizeLocale('Français')).toBe('fr');
    expect(locales.normalizeLocale('Deutsch')).toBeNull();
  });

  it('exposes the codes, the default and a label key per locale', () => {
    expect(locales.DEFAULT_LOCALE).toBe('en');
    expect([...locales.SUPPORTED_LOCALES]).toEqual(['en', 'fr']);
    expect(locales.LOCALES).toEqual([
      { code: 'en', labelKey: 'lang.en' },
      { code: 'fr', labelKey: 'lang.fr' },
    ]);
  });
});
