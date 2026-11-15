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
      { code: 'en', labelKey: 'lang.en', stage: 'stable' },
      { code: 'fr', labelKey: 'lang.fr', stage: 'stable' },
    ]);
  });

  it('marks the locales still being translated', () => {
    const set = createLocales({ en: 'English', de: 'Deutsch' }, 'en', ['de']);

    expect(set.LOCALES.map((locale) => locale.stage)).toEqual(['stable', 'beta']);
  });

  it('prefers the regional locale a tag names over the language it belongs to', () => {
    const set = createLocales({ pt: 'Português', 'pt-BR': 'Português (Brasil)' }, 'pt');

    expect(set.normalizeLocale('pt_br')).toBe('pt-BR');
    expect(set.normalizeLocale('pt-PT')).toBe('pt');
  });

  it('hands a bare language its regional locale when that is all there is', () => {
    const set = createLocales({ en: 'English', 'zh-Hant': '繁體中文' }, 'en');

    expect(set.normalizeLocale('zh')).toBe('zh-Hant');
    expect(set.normalizeLocale('zh-Hant-TW')).toBe('zh-Hant');
  });
});
