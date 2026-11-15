import { describe, expect, it } from 'vitest';
import { renderCatalogTypes } from './catalog-types';

const SOURCE = {
  'nav.home': 'Home',
  'cart.items': '{count} items in {store}',
  'cart.items_one': 'One item in {store}',
  'cart.seats': 'Seats',
  'cart.seats_taken_one': '{taken} seat taken',
  'status.other': 'Other',
};

describe('renderCatalogTypes', () => {
  it('declares every locale folder', () => {
    const out = renderCatalogTypes({ locales: ['fr', 'en', 'pt-BR'], source: SOURCE });

    expect(out).toContain("    locale: 'en' | 'fr' | 'pt-BR';");
  });

  it('declares a message with no variables as taking none', () => {
    const out = renderCatalogTypes({ locales: ['en'], source: SOURCE });

    expect(out).toContain("      'nav.home': {};");
    expect(out).toContain("      'status.other': {};");
  });

  it('folds plural variants into their base key and types the selector as a number', () => {
    const out = renderCatalogTypes({ locales: ['en'], source: SOURCE });

    expect(out).toContain("      'cart.items': { count: number; store: V };");
    expect(out).toContain("      'cart.seats': { taken: number };");
    expect(out).not.toContain('cart.items_one');
  });

  it('augments the package rather than replacing it', () => {
    const out = renderCatalogTypes({ locales: ['en'], source: SOURCE });

    expect(out).toContain('export {};');
  });

  it('renders the same text whatever order the keys and locales arrive in', () => {
    const reversed = Object.fromEntries(Object.entries(SOURCE).reverse());

    expect(renderCatalogTypes({ locales: ['fr', 'en'], source: reversed })).toBe(
      renderCatalogTypes({ locales: ['en', 'fr'], source: SOURCE }),
    );
  });
});
