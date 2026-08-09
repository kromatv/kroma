import type { Metadata } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import {
  collectGenres,
  compareTitles,
  hasGenre,
  isSortMode,
  letterMarks,
  type Sortable,
  sortTitles,
  titleLetter,
} from './browse';

function title(p: {
  title: string;
  year?: number | null;
  addedAt?: string;
  rating?: number | null;
  releaseDate?: string | null;
  genres?: string[];
}): Sortable {
  const { title, year = null, addedAt = '2020-01-01T00:00:00Z', rating, releaseDate, genres } = p;
  const meta =
    rating === undefined && releaseDate === undefined && genres === undefined
      ? null
      : ({ rating, releaseDate, genres: genres ?? [] } as unknown as Metadata);
  return { title, year, addedAt, metadata: meta };
}

describe('isSortMode', () => {
  it('accepts the known modes and rejects anything else', () => {
    expect(isSortMode('added')).toBe(true);
    expect(isSortMode('rating')).toBe(true);
    expect(isSortMode('nope')).toBe(false);
    expect(isSortMode(undefined)).toBe(false);
  });
});

describe('sortTitles', () => {
  it('does not mutate the input array', () => {
    const items = [title({ title: 'B' }), title({ title: 'A' })];
    const before = [...items];
    sortTitles(items, 'title');
    expect(items).toEqual(before);
  });

  it('sorts by title A→Z', () => {
    const items = [title({ title: 'Csorted' }), title({ title: 'Asorted' }), title({ title: 'B' })];
    expect(sortTitles(items, 'title').map((t) => t.title)).toEqual(['Asorted', 'B', 'Csorted']);
  });

  it('sorts by date added, most recent first', () => {
    const items = [
      title({ title: 'old', addedAt: '2019-01-01T00:00:00Z' }),
      title({ title: 'new', addedAt: '2023-05-01T00:00:00Z' }),
      title({ title: 'mid', addedAt: '2021-01-01T00:00:00Z' }),
    ];
    expect(sortTitles(items, 'added').map((t) => t.title)).toEqual(['new', 'mid', 'old']);
  });

  it('sorts by release date (newest first), preferring metadata over year', () => {
    const items = [
      title({ title: 'a', year: 2000, releaseDate: '2010-06-01' }),
      title({ title: 'b', year: 2015 }), // year fallback
      title({ title: 'c', releaseDate: '2022-01-01' }),
    ];
    expect(sortTitles(items, 'release').map((t) => t.title)).toEqual(['c', 'b', 'a']);
  });

  it('sorts titles with no release info last', () => {
    const items = [
      title({ title: 'dated', releaseDate: '2010-01-01' }),
      title({ title: 'undated' }),
    ];
    expect(sortTitles(items, 'release').map((t) => t.title)).toEqual(['dated', 'undated']);
  });

  it('exposes a reusable comparator via compareTitles', () => {
    const cmp = compareTitles('title');
    const items = [title({ title: 'B' }), title({ title: 'A' })];
    expect([...items].sort(cmp).map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('sorts by rating (highest first) with missing ratings last, tiebroken by year', () => {
    const items = [
      title({ title: 'low', rating: 6.1 }),
      title({ title: 'none' }),
      title({ title: 'high', rating: 8.9 }),
      title({ title: 'tieOld', rating: 7, year: 1999 }),
      title({ title: 'tieNew', rating: 7, year: 2020 }),
    ];
    expect(sortTitles(items, 'rating').map((t) => t.title)).toEqual([
      'high',
      'tieNew',
      'tieOld',
      'low',
      'none',
    ]);
  });
});

describe('collectGenres', () => {
  it('unions genres with counts, most common first then alphabetical', () => {
    const items = [
      title({ title: 'a', genres: ['Action', 'Sci-Fi'] }),
      title({ title: 'b', genres: ['Action', 'Drama'] }),
      title({ title: 'c', genres: ['Action'] }),
    ];
    expect(collectGenres(items)).toEqual([
      { name: 'Action', count: 3 },
      { name: 'Drama', count: 1 },
      { name: 'Sci-Fi', count: 1 },
    ]);
  });

  it('ignores blank/whitespace genres and titles without metadata', () => {
    const items = [title({ title: 'a', genres: ['Action', '  '] }), title({ title: 'b' })];
    expect(collectGenres(items)).toEqual([{ name: 'Action', count: 1 }]);
  });
});

describe('hasGenre', () => {
  const item = title({ title: 'a', genres: ['Action', 'Comedy'] });

  it('matches a carried genre (trim-tolerant)', () => {
    expect(hasGenre(item, 'Comedy')).toBe(true);
    expect(hasGenre(item, '  Action ')).toBe(true);
  });

  it('does not match an absent genre or a title without metadata', () => {
    expect(hasGenre(item, 'Horror')).toBe(false);
    expect(hasGenre(title({ title: 'b' }), 'Action')).toBe(false);
  });
});

describe('titleLetter', () => {
  it('uppercases and folds diacritics', () => {
    expect(titleLetter('Avatar')).toBe('A');
    expect(titleLetter('école')).toBe('E');
    expect(titleLetter('Élite')).toBe('E');
  });

  it('buckets digit-led titles under #', () => {
    expect(titleLetter('24 heures chrono')).toBe('#');
    expect(titleLetter("'71")).toBe('#');
  });

  it('skips leading punctuation, like localeCompare does', () => {
    expect(titleLetter('…And Justice for All')).toBe('A');
    expect(titleLetter('"Bonjour"')).toBe('B');
  });

  it('buckets symbol-only and non-Latin titles under #', () => {
    expect(titleLetter('')).toBe('#');
    expect(titleLetter('★')).toBe('#');
    expect(titleLetter('龍門客棧')).toBe('#');
  });
});

describe('letterMarks', () => {
  it('records the first index of each bucket, in list order', () => {
    const items = ['24', 'Amélie', 'Avatar', 'École', 'Zorro'].map((t) => title({ title: t }));
    expect(letterMarks(items)).toEqual([
      { letter: '#', index: 0 },
      { letter: 'A', index: 1 },
      { letter: 'E', index: 3 },
      { letter: 'Z', index: 4 },
    ]);
  });

  it('keeps only the first occurrence when a bucket reappears', () => {
    const items = ['1917', 'Alien', '龍門客棧'].map((t) => title({ title: t }));
    expect(letterMarks(items)).toEqual([
      { letter: '#', index: 0 },
      { letter: 'A', index: 1 },
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(letterMarks([])).toEqual([]);
  });
});
