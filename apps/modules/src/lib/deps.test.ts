import { describe, expect, it } from 'vitest';
import { depEntries } from './deps';

describe('depEntries', () => {
  it('reads schema 2, which pins each dependency to a range', () => {
    expect(depEntries({ 'tv.kroma.torrents': '^1.2.0', 'tv.kroma.vpn': '*' })).toEqual([
      { id: 'tv.kroma.torrents', range: '^1.2.0' },
      { id: 'tv.kroma.vpn', range: '*' },
    ]);
  });

  it('reads the old array form, which names a dependency without pinning it', () => {
    expect(depEntries(['tv.kroma.torrents'])).toEqual([{ id: 'tv.kroma.torrents', range: null }]);
  });

  it('answers empty for a module that depends on nothing', () => {
    expect(depEntries(undefined)).toEqual([]);
    expect(depEntries(null)).toEqual([]);
    expect(depEntries({})).toEqual([]);
    expect(depEntries([])).toEqual([]);
  });
});
