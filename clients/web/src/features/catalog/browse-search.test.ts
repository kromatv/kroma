// The url is a trust boundary: an unrecognised `sort` renders an empty grid that
// reads as an empty library, and a bookmark reopens it broken every time.

import { describe, expect, it } from 'vitest';
import { validateBrowseSearch } from './browse-search';

describe('validateBrowseSearch', () => {
  it('keeps a sort mode the page understands', () => {
    const kept = validateBrowseSearch({ sort: 'added' });
    expect(kept.sort).toBe('added');
  });

  it('drops a sort mode it does not', () => {
    expect(validateBrowseSearch({ sort: 'sideways' })).toEqual({});
  });

  it('drops a sort that is not even a string', () => {
    for (const sort of [42, null, undefined, {}, ['added']]) {
      expect(validateBrowseSearch({ sort })).toEqual({});
    }
  });

  it('keeps a genre', () => {
    expect(validateBrowseSearch({ genre: 'Science Fiction' })).toEqual({
      genre: 'Science Fiction',
    });
  });

  it('drops an EMPTY genre rather than filtering on nothing', () => {
    // `?genre=` is what a cleared filter leaves behind.
    expect(validateBrowseSearch({ genre: '' })).toEqual({});
  });

  it('drops a genre that is not a string', () => {
    for (const genre of [1, true, null, {}, ['Drama']]) {
      expect(validateBrowseSearch({ genre })).toEqual({});
    }
  });

  it('keeps both together', () => {
    expect(validateBrowseSearch({ sort: 'added', genre: 'Drama' })).toEqual({
      sort: 'added',
      genre: 'Drama',
    });
  });

  it('keeps the good half of a half-valid url', () => {
    expect(validateBrowseSearch({ sort: 'nope', genre: 'Drama' })).toEqual({ genre: 'Drama' });
  });

  it('ignores parameters it was never asked about', () => {
    expect(validateBrowseSearch({ utm_source: 'x', page: '3', genre: 'Drama' })).toEqual({
      genre: 'Drama',
    });
  });

  it('is empty for an empty url', () => {
    expect(validateBrowseSearch({})).toEqual({});
  });

  it('drops a genre longer than any the catalogue names', () => {
    expect(validateBrowseSearch({ genre: 'a'.repeat(65) })).toEqual({});
  });

  it('keeps a genre right at the bound', () => {
    expect(validateBrowseSearch({ genre: 'a'.repeat(64) })).toEqual({ genre: 'a'.repeat(64) });
  });

  it('OMITS a dropped key rather than setting it undefined', () => {
    // The router serialises the result back into the url; an explicit
    // `undefined` is a `?sort=` that comes straight back here next navigation.
    const out = validateBrowseSearch({ sort: 'nope' });
    expect(Object.hasOwn(out, 'sort')).toBe(false);
  });
});
