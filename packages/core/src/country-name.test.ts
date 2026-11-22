import { afterEach, describe, expect, it, vi } from 'vitest';
import { countryName, countryOptions } from './country-name';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a country name', () => {
  it('is the name the reader speaks', () => {
    expect(countryName('DE', 'fr')).toBe('Allemagne');
    expect(countryName('DE', 'en')).toBe('Germany');
  });

  it('falls back to the code where the engine names no regions', () => {
    vi.stubGlobal('Intl', { ...Intl, DisplayNames: undefined });

    expect(countryName('DE', 'fr')).toBe('DE');
  });
});

describe('the country picker', () => {
  it('lists every country by its name in alphabetical order', () => {
    expect(countryOptions(['US', 'DE', 'FR'], 'fr').map((row) => row.label)).toEqual([
      'Allemagne',
      'États-Unis',
      'France',
    ]);
  });
});
