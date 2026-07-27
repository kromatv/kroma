import { describe, expect, it } from 'vitest';
import { createI18n, interpolate, translateIn } from './i18n-engine';

describe('interpolate', () => {
  it('replaces tokens with values', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
    expect(interpolate('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('leaves unknown tokens alone', () => {
    expect(interpolate('Hello {name}!', { other: 'World' })).toBe('Hello {name}!');
  });

  it('handles missing vars', () => {
    expect(interpolate('Hello {name}!')).toBe('Hello {name}!');
  });
});

describe('translateIn', () => {
  const catalogs = {
    en: {
      simple: 'Simple',
      withVar: 'Hello {name}',
      plural: '{count} items',
      plural_one: '{count} item',
    },
    fr: {
      simple: 'Simple FR',
    },
  };

  it('translates simple keys', () => {
    expect(translateIn(catalogs, 'en', 'en', 'simple')).toBe('Simple');
    expect(translateIn(catalogs, 'fr', 'en', 'simple')).toBe('Simple FR');
  });

  it('falls back to default locale', () => {
    expect(translateIn(catalogs, 'fr', 'en', 'withVar', { name: 'Joe' })).toBe('Hello Joe');
  });

  it('handles plurals', () => {
    expect(translateIn(catalogs, 'en', 'en', 'plural', { count: 1 })).toBe('1 item');
    expect(translateIn(catalogs, 'en', 'en', 'plural', { count: 2 })).toBe('2 items');
    expect(translateIn(catalogs, 'en', 'en', 'plural', { count: 0 })).toBe('0 items');
  });

  it('returns undefined for missing keys', () => {
    expect(translateIn(catalogs, 'en', 'en', 'missing')).toBeUndefined();
  });
});

describe('createI18n', () => {
  const catalogs = {
    en: { 'lang.en': 'English', greeting: 'Hi', item: '{count} items', item_one: '{count} item' },
    fr: { 'lang.fr': 'Français', greeting: 'Bonjour' },
  };
  const i18n = createI18n(catalogs, 'en');

  it('isLocale identifies supported locales', () => {
    expect(i18n.isLocale('en')).toBe(true);
    expect(i18n.isLocale('fr')).toBe(true);
    expect(i18n.isLocale('de')).toBe(false);
  });

  it('normalizeLocale maps tags and names', () => {
    expect(i18n.normalizeLocale('en-US')).toBe('en');
    expect(i18n.normalizeLocale('fr')).toBe('fr');
    expect(i18n.normalizeLocale('English')).toBe('en');
    expect(i18n.normalizeLocale('Français')).toBe('fr');
    expect(i18n.normalizeLocale('Deutsch')).toBeNull();
  });

  it('translate works with plural and fallback', () => {
    expect(i18n.translate('fr', 'greeting')).toBe('Bonjour');
    expect(i18n.translate('en', 'item', { count: 1 })).toBe('1 item');
    expect(i18n.translate('fr', 'item', { count: 5 })).toBe('5 items'); // fallback to en
  });

  it('createTranslator binds locale', () => {
    const t = i18n.createTranslator('fr');
    expect(t('greeting')).toBe('Bonjour');
  });
});
