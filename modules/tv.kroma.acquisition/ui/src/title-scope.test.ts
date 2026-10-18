import { describe, expect, it } from 'vitest';
import { toTitleScope } from './title-scope';

describe('toTitleScope', () => {
  it('renames the core tag to the one this module routes on', () => {
    expect(toTitleScope({ scope: 'all' })).toEqual({ kind: 'all' });
    expect(toTitleScope({ scope: 'movie' })).toEqual({ kind: 'movie' });
    expect(toTitleScope({ scope: 'season', season: 2 })).toEqual({ kind: 'season', season: 2 });
    expect(toTitleScope({ scope: 'episode', season: 2, episode: 5 })).toEqual({
      kind: 'episode',
      season: 2,
      episode: 5,
    });
  });
});
