import { describe, expect, it } from 'vitest';
import { validateTrendingSearch } from './trending-search';

describe('validateTrendingSearch', () => {
  it('keeps a page past the first', () => {
    expect(validateTrendingSearch({ page: 3 })).toEqual({ page: 3 });
  });

  it('leaves the first page out of the url', () => {
    expect(validateTrendingSearch({ page: 1 })).toEqual({});
  });

  it('drops a page that is not a whole number past the first', () => {
    for (const page of [0, -2, 2.5, '2', null, {}, [2]]) {
      expect(validateTrendingSearch({ page })).toEqual({});
    }
  });

  it('drops what it does not know', () => {
    expect(validateTrendingSearch({ page: 2, sort: 'added' })).toEqual({ page: 2 });
  });
});
