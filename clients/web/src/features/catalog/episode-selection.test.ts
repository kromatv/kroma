import { describe, expect, it } from 'vitest';
import { epKey, toEpisodeRefs, toggle } from '#web/features/catalog/episode-selection';

describe('toggle', () => {
  it('adds then removes, without touching the set it was handed', () => {
    const start = new Set<string>();
    const one = toggle(start, epKey(1, 2));
    expect(one.has('1-2')).toBe(true);
    expect(start.size).toBe(0);
    expect(toggle(one, '1-2').has('1-2')).toBe(false);
  });
});

describe('toEpisodeRefs', () => {
  it('orders season by season, then episode', () => {
    expect(toEpisodeRefs(new Set(['2-1', '1-10', '1-2']))).toEqual([
      { season: 1, episode: 2 },
      { season: 1, episode: 10 },
      { season: 2, episode: 1 },
    ]);
  });

  it('drops a malformed key rather than sending a bogus episode to the API', () => {
    // `Number('')` is 0, so a half-written key would otherwise become episode 0
    // and the request would carry an episode that does not exist.
    expect(toEpisodeRefs(new Set(['1-2', 'nope', '3-', '-4', '1-x']))).toEqual([
      { season: 1, episode: 2 },
    ]);
  });

  it('keeps season 0, which is where specials live', () => {
    expect(toEpisodeRefs(new Set(['0-1']))).toEqual([{ season: 0, episode: 1 }]);
  });

  it('is empty for an empty selection', () => {
    expect(toEpisodeRefs(new Set())).toEqual([]);
  });
});
