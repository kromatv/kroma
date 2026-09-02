import { describe, expect, it } from 'vitest';
import { renderCatalogTypes } from './catalog-types';

const FILES = [
  { locale: 'en', namespace: 'about' },
  { locale: 'fr', namespace: 'about' },
  { locale: 'en', namespace: 'addProfile' },
  { locale: 'fr', namespace: 'addProfile' },
  { locale: 'fr', namespace: 'draft' },
];

describe('renderCatalogTypes', () => {
  it('declares the locales and folds every file of the default locale into the messages', () => {
    const out = renderCatalogTypes({ files: FILES, defaultLocale: 'en' });

    expect(out).toContain("import type aboutMessages from './en/about.json';");
    expect(out).toContain("    locale: 'en' | 'fr';");
    expect(out).toContain('      typeof aboutMessages &\n      typeof addProfileMessages;');
    expect(out).not.toContain('draft');
  });

  it('refuses a default locale that has no folder', () => {
    expect(() => renderCatalogTypes({ files: FILES, defaultLocale: 'de' })).toThrow('"de"');
  });

  it('renders the same text for the same files in any order', () => {
    expect(renderCatalogTypes({ files: [...FILES].reverse(), defaultLocale: 'en' })).toBe(
      renderCatalogTypes({ files: FILES, defaultLocale: 'en' }),
    );
  });
});
