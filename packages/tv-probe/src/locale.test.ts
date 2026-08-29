import { describe, expect, it } from 'vitest';
import { locales, message } from './locale';

describe('the catalogs the run reads the screen in', () => {
  it('lists the languages the app ships and nothing else in the directory', () => {
    const shipped = locales();

    expect(shipped).toContain('en');
    expect(shipped).toContain('fr');
    expect(shipped.some((locale) => locale.includes('test'))).toBe(false);
  });

  it('reads a message in the language it was asked for', () => {
    expect(message('en', 'nav.films')).toBe('Movies');
    expect(message('fr', 'nav.films')).toBe('Films');
  });

  it('throws on a key the catalog no longer has', () => {
    expect(() => message('en', 'nav.renamed')).toThrow('en: no message "nav.renamed"');
  });
});
