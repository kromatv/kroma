import { describe, expect, it } from 'vitest';
import { scopeOfTarget, toTitleScope } from './title-scope';

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

describe('scopeOfTarget', () => {
  it('has nothing to narrow on a film', () => {
    expect(scopeOfTarget('movie', 'episode', '', '')).toEqual({ scope: 'movie' });
  });

  it('sweeps a whole show without reading the boxes', () => {
    expect(scopeOfTarget('show', 'all', '', '')).toEqual({ scope: 'all' });
  });

  it('carries the numbers the target asks for', () => {
    expect(scopeOfTarget('show', 'season', '3', '7')).toEqual({ scope: 'season', season: 3 });
    expect(scopeOfTarget('show', 'episode', '3', '7')).toEqual({
      scope: 'episode',
      season: 3,
      episode: 7,
    });
  });

  it('takes season 0, which is where the specials live', () => {
    expect(scopeOfTarget('show', 'season', '0', '')).toEqual({ scope: 'season', season: 0 });
  });

  it('refuses a scope whose number is missing, so no sweep runs half aimed', () => {
    expect(scopeOfTarget('show', 'season', '', '')).toBeNull();
    expect(scopeOfTarget('show', 'episode', '3', '')).toBeNull();
    expect(scopeOfTarget('show', 'episode', '3', '0')).toBeNull();
  });
});
