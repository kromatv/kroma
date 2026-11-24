import { describe, expect, it } from 'vitest';
import { CATALOG_NAV, TITLE_SHELF } from './catalog-nav';

const pageOf = (labelKey: string) => CATALOG_NAV.find((item) => item.labelKey === labelKey)?.to;

describe('the page a title in the library goes back to', () => {
  it('is Movies for a movie', () => {
    expect(TITLE_SHELF.movie).toBe(pageOf('nav.films'));
  });

  it('is Series for a series', () => {
    expect(TITLE_SHELF.show).toBe(pageOf('nav.series'));
  });
});
