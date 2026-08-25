import type { DiscoverEntry } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  featuredSavedTitle,
  filterSavedTitles,
  type SavedTitle,
  savedFacets,
  sortSavedTitles,
  toSavedSort,
} from './saved-titles';

const ENTRY: DiscoverEntry = {
  kind: 'movie',
  tmdbId: 1,
  title: 'Zulu',
  year: null,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  rating: null,
  inLibrary: false,
  localId: null,
  requestId: null,
  requestStatus: null,
  requestProgress: null,
};

function title(over: Partial<SavedTitle> & { key: string }): SavedTitle {
  return {
    kind: 'movie',
    title: over.key,
    year: null,
    rating: null,
    backdrop: null,
    available: true,
    source: { from: 'discover', entry: ENTRY },
    ...over,
  };
}

const keysOf = (titles: readonly SavedTitle[]) => titles.map((one) => one.key);

describe('savedFacets', () => {
  it('counts each kind and how many are not in the library', () => {
    const titles = [
      title({ key: 'a' }),
      title({ key: 'b', kind: 'show' }),
      title({ key: 'c', available: false }),
    ];

    expect(savedFacets(titles)).toEqual({ total: 3, movies: 2, shows: 1, unavailable: 1 });
  });

  it('has nothing to count in an empty list', () => {
    expect(savedFacets([])).toEqual({ total: 0, movies: 0, shows: 0, unavailable: 0 });
  });
});

describe('filterSavedTitles', () => {
  const titles = [
    title({ key: 'here-movie' }),
    title({ key: 'here-show', kind: 'show' }),
    title({ key: 'wanted-movie', available: false }),
    title({ key: 'wanted-show', kind: 'show', available: false }),
  ];

  it('keeps everything when no facet is picked', () => {
    const kept = filterSavedTitles(titles, { kind: 'all', unavailableOnly: false });

    expect(keysOf(kept)).toEqual(['here-movie', 'here-show', 'wanted-movie', 'wanted-show']);
  });

  it('narrows to one kind', () => {
    const kept = filterSavedTitles(titles, { kind: 'show', unavailableOnly: false });

    expect(keysOf(kept)).toEqual(['here-show', 'wanted-show']);
  });

  it('narrows kind and availability together', () => {
    const kept = filterSavedTitles(titles, { kind: 'movie', unavailableOnly: true });

    expect(keysOf(kept)).toEqual(['wanted-movie']);
  });
});

describe('sortSavedTitles', () => {
  const titles = [
    title({ key: 'newest', title: 'Zulu', year: 1964, rating: 7.4 }),
    title({ key: 'middle', title: 'Alien', year: 1979, rating: 8.5 }),
    title({ key: 'oldest', title: 'Marnie', year: 1964, rating: 7.1 }),
  ];

  it('leaves the saved order alone under recent', () => {
    expect(keysOf(sortSavedTitles(titles, 'recent'))).toEqual(['newest', 'middle', 'oldest']);
  });

  it('orders by title, year and rating', () => {
    expect(keysOf(sortSavedTitles(titles, 'title'))).toEqual(['middle', 'oldest', 'newest']);
    expect(keysOf(sortSavedTitles(titles, 'rating'))).toEqual(['middle', 'newest', 'oldest']);
    expect(keysOf(sortSavedTitles(titles, 'year'))).toEqual(['middle', 'newest', 'oldest']);
  });

  it('keeps the saved order between titles a mode cannot tell apart', () => {
    const undated = [title({ key: 'first' }), title({ key: 'second' })];

    expect(keysOf(sortSavedTitles(undated, 'year'))).toEqual(['first', 'second']);
  });

  it('leaves the list it was handed untouched', () => {
    sortSavedTitles(titles, 'title');

    expect(keysOf(titles)).toEqual(['newest', 'middle', 'oldest']);
  });
});

describe('featuredSavedTitle', () => {
  it('picks the best-rated title that has artwork', () => {
    const titles = [
      title({ key: 'unrated', backdrop: 'a.jpg' }),
      title({ key: 'best-without-art', rating: 9.1 }),
      title({ key: 'best-with-art', rating: 8.2, backdrop: 'b.jpg' }),
    ];

    expect(featuredSavedTitle(titles)?.key).toBe('best-with-art');
  });

  it('has nothing to feature when no title has artwork', () => {
    expect(featuredSavedTitle([title({ key: 'a' })])).toBeUndefined();
  });
});

describe('toSavedSort', () => {
  it('accepts a mode the bar can offer and refuses anything else', () => {
    expect(toSavedSort('rating')).toBe('rating');
    expect(toSavedSort('decade')).toBeUndefined();
  });
});
