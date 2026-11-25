import { describe, expect, it } from 'vitest';
import { flagRegion } from './locale-flag';

describe('flagRegion', () => {
  it('gives each language the country the table names for it', () => {
    expect(flagRegion('fr')).toBe('FR');
    expect(flagRegion('en')).toBe('US');
    expect(flagRegion('pt-BR')).toBe('BR');
    expect(flagRegion('zh-Hans')).toBe('CN');
  });

  it('reads the region of a regional language the table does not name', () => {
    expect(flagRegion('fr-CA')).toBe('CA');
    expect(flagRegion('sr-Latn-RS')).toBe('RS');
  });

  it('gives no flag to a language with neither a row nor a region', () => {
    expect(flagRegion('ar')).toBeNull();
    expect(flagRegion('zh-Hant')).toBeNull();
    expect(flagRegion('es-419')).toBeNull();
    expect(flagRegion('constructor')).toBeNull();
  });
});
