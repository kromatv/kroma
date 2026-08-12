import { describe, expect, it } from 'vitest';
import { fuzzyQuery, fuzzyScore, fuzzySearch } from './fuzzy-search';

const ranked = (candidates: readonly string[], query: string) =>
  fuzzySearch(candidates, query).map((hit) => hit.text);

const GLYPHS = [
  'arrow-right',
  'chevron-down',
  'chevron-right',
  'chevrons-right',
  'player-pause',
  'player-pause-filled',
  'player-play',
  'row-insert-bottom',
  'search',
  'search-off',
  'world-search',
];

describe('fuzzyQuery', () => {
  it('reads a query without its case or its separators', () => {
    expect(fuzzyQuery('Player Pause')).toBe('playerpause');
    expect(fuzzyQuery('chevron-right')).toBe('chevronright');
  });

  it('reads a query that is nothing but separators as empty', () => {
    expect(fuzzyQuery(' - ')).toBe('');
  });
});

describe('fuzzyScore', () => {
  it('rejects a query whose letters are not all there in order', () => {
    expect(fuzzyScore('chevron-right', 'thgir')).toBeNull();
    expect(fuzzyScore('chevron-right', 'chevronx')).toBeNull();
  });

  it('scores a match without caring about case on either side', () => {
    expect(fuzzyScore('Chevron-Right', 'CHEVRON')).toBe(fuzzyScore('chevron-right', 'chevron'));
  });

  it('scores every text the same for an empty query', () => {
    expect(fuzzyScore('chevron-right', '')).toBe(0);
    expect(fuzzyScore('search', '  ')).toBe(0);
  });

  it('reads a separator in the query as one the name may or may not have', () => {
    expect(fuzzyScore('player-pause', 'player pause')).toBe(
      fuzzyScore('player-pause', 'playerpause'),
    );
    expect(fuzzyScore('player-pause', 'player-pause')).toBe(
      fuzzyScore('player-pause', 'playerpause'),
    );
  });
});

describe('fuzzySearch', () => {
  it('finds a name the query has dropped a letter from', () => {
    expect(ranked(GLYPHS, 'chevrn')).toEqual(['chevron-down', 'chevron-right', 'chevrons-right']);
  });

  it('finds a name across the separator the query left out', () => {
    expect(ranked(GLYPHS, 'playpause')).toEqual(['player-pause', 'player-pause-filled']);
  });

  it('ranks a contiguous run above the same letters scattered', () => {
    expect(ranked(['plus-arrow-up', 'pause'], 'pau')).toEqual(['pause', 'plus-arrow-up']);
  });

  it('ranks a match starting a word above one inside one', () => {
    expect(ranked(['arrow-right', 'row-insert-bottom'], 'row')).toEqual([
      'row-insert-bottom',
      'arrow-right',
    ]);
  });

  it('ranks an earlier match above a later one', () => {
    expect(ranked(['world-search', 'search-off'], 'search')).toEqual([
      'search-off',
      'world-search',
    ]);
  });

  it('gives a tie to the shorter name', () => {
    expect(ranked(['search-off', 'search'], 'search')).toEqual(['search', 'search-off']);
  });

  it('keeps the order it was given between hits that tie outright', () => {
    expect(ranked(['b-play', 'a-play'], 'play')).toEqual(['b-play', 'a-play']);
  });

  it('returns every candidate for a query of nothing but separators', () => {
    expect(ranked(GLYPHS, ' - ')).toEqual(GLYPHS);
    expect(ranked(GLYPHS, '')).toEqual(GLYPHS);
  });

  it('drops what the query does not match at all', () => {
    expect(ranked(GLYPHS, 'zzz')).toEqual([]);
  });
});
