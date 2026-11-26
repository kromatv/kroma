import { describe, expect, it } from 'vitest';
import { flagRegion } from './locale-flag';

describe('flagRegion', () => {
  it('gives each language the country CLDR finds it most likely written in', () => {
    expect(flagRegion('fr')).toBe('FR');
    expect(flagRegion('en')).toBe('US');
    expect(flagRegion('pt')).toBe('BR');
    expect(flagRegion('zh-Hans')).toBe('CN');
    expect(flagRegion('it')).toBe('IT');
  });

  it('reads the region a regional language carries', () => {
    expect(flagRegion('fr-CA')).toBe('CA');
    expect(flagRegion('pt-PT')).toBe('PT');
    expect(flagRegion('sr-Latn-RS')).toBe('RS');
  });

  it('gives no flag to a language no one country speaks for', () => {
    expect(flagRegion('ar')).toBeNull();
    expect(flagRegion('zh-Hant')).toBeNull();
  });

  it('gives no flag to a tag that names no country, or that is not a tag', () => {
    expect(flagRegion('es-419')).toBeNull();
    expect(flagRegion('constructor')).toBeNull();
  });

  it('answers the same on an engine without Intl.Locale', () => {
    const { Locale } = Intl;
    Reflect.deleteProperty(Intl, 'Locale');

    try {
      expect(flagRegion('de')).toBe('DE');
      expect(flagRegion('zh-Hans')).toBe('CN');
      expect(flagRegion('pa-Arab')).toBe('PK');
    } finally {
      Object.assign(Intl, { Locale });
    }
  });
});
