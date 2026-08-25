import { describe, expect, it } from 'vitest';
import { validateDiscoverSearch } from './search';

describe('validateDiscoverSearch', () => {
  it('defaults to an empty query and all types', () => {
    expect(validateDiscoverSearch({})).toEqual({ q: '', type: 'all' });
  });

  it('keeps a query string', () => {
    expect(validateDiscoverSearch({ q: 'dune' })).toEqual({ q: 'dune', type: 'all' });
  });

  it('keeps a multi-word query', () => {
    expect(validateDiscoverSearch({ q: 'the matrix' })).toEqual({ q: 'the matrix', type: 'all' });
  });

  it('keeps a recognised type', () => {
    expect(validateDiscoverSearch({ q: '', type: 'movie' })).toEqual({ q: '', type: 'movie' });
    expect(validateDiscoverSearch({ q: '', type: 'tv' })).toEqual({ q: '', type: 'tv' });
  });

  it('falls back to all for an unrecognised type', () => {
    expect(validateDiscoverSearch({ q: '', type: 'sideways' })).toEqual({ q: '', type: 'all' });
  });

  it('falls back to all for a non-string type', () => {
    for (const type of [42, null, undefined, {}, ['movie']]) {
      expect(validateDiscoverSearch({ q: '', type })).toEqual({ q: '', type: 'all' });
    }
  });

  it('falls back to empty for a non-string q', () => {
    for (const q of [42, null, undefined, {}, ['dune']]) {
      expect(validateDiscoverSearch({ q })).toEqual({ q: '', type: 'all' });
    }
  });

  it('keeps both together', () => {
    expect(validateDiscoverSearch({ q: 'dune', type: 'movie' })).toEqual({
      q: 'dune',
      type: 'movie',
    });
  });

  it('ignores parameters it was never asked about', () => {
    expect(validateDiscoverSearch({ utm_source: 'x', q: 'dune', type: 'tv' })).toEqual({
      q: 'dune',
      type: 'tv',
    });
  });
});
