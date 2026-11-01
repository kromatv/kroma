import { describe, expect, it } from 'vitest';
import { validateShowSearch } from './show-search';

describe('validateShowSearch', () => {
  it('reads a season from the address', () => {
    expect(validateShowSearch({ season: '2' })).toEqual({ season: 2 });
  });

  it('keeps season zero, where the specials live', () => {
    expect(validateShowSearch({ season: 0 })).toEqual({ season: 0 });
  });

  it('leaves the key out when there is no season', () => {
    expect(validateShowSearch({})).toEqual({});
  });

  it('drops a season that is not a number', () => {
    expect(validateShowSearch({ season: 'two' })).toEqual({});
  });

  it('drops a negative season', () => {
    expect(validateShowSearch({ season: -1 })).toEqual({});
  });
});
