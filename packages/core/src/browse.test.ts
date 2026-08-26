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
  tmdbGenreIds?: number[];
}): Sortable {
  const {
    title,
    year = null,
    addedAt = '2020-01-01T00:00:00Z',
    rating,
    releaseDate,
    genres,
    tmdbGenreIds,
  } = p;
  const meta =
    rating === undefined && releaseDate === undefined && genres === undefined
      ? null
      : ({ rating, releaseDate, genres: genres ?? [], tmdbGenreIds } as unknown as Metadata);
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

describe('comparator tiebreaks', () => {
  it('breaks an identical added date on the title, and an identical title on the date', () => {
    const added = compareTitles('added');
    const a = title({ title: 'Alien', addedAt: '2020-01-01T00:00:00Z' });
    const b = title({ title: 'Brazil', addedAt: '2020-01-01T00:00:00Z' });
    expect(added(a, b)).toBeLessThan(0);
    expect(added(b, a)).toBeGreaterThan(0);

    const byTitle = compareTitles('title');
    const old = title({ title: 'Dune', addedAt: '2019-01-01T00:00:00Z' });
    const recent = title({ title: 'Dune', addedAt: '2024-01-01T00:00:00Z' });
    expect(byTitle(recent, old)).toBeLessThan(0);
    expect(byTitle(old, recent)).toBeGreaterThan(0);
  });

  it('files an undated title after a dated one, whichever side it is on', () => {
    const release = compareTitles('release');
    const dated = title({ title: 'Alien', releaseDate: '1979-05-25' });
    const undated = title({ title: 'Brazil' });
    expect(release(dated, undated)).toBe(-1);
    expect(release(undated, dated)).toBe(1);
  });

  it('breaks two undated titles, and two same-day releases, on the title', () => {
    const release = compareTitles('release');
    expect(release(title({ title: 'Alien' }), title({ title: 'Brazil' }))).toBeLessThan(0);
    const sameDay = (t: string) => title({ title: t, releaseDate: '2010-06-01' });
    expect(release(sameDay('Alien'), sameDay('Brazil'))).toBeLessThan(0);
  });

  it('falls back to the year when the release date is unparseable', () => {
    const release = compareTitles('release');
    const broken = title({ title: 'Alien', year: 2015, releaseDate: 'unknown' });
    const older = title({ title: 'Brazil', releaseDate: '1985-02-20' });
    expect(release(broken, older)).toBeLessThan(0);
  });

  it('orders two unrated titles by year, then by title', () => {
    const rating = compareTitles('rating');
    expect(
      rating(title({ title: 'Alien', year: 1979 }), title({ title: 'Brazil', year: 1985 })),
    ).toBeGreaterThan(0);
    expect(rating(title({ title: 'Alien' }), title({ title: 'Brazil' }))).toBeLessThan(0);
  });

  it('breaks an equal rating and an equal year on the title', () => {
    const rating = compareTitles('rating');
    const a = title({ title: 'Alien', rating: 7, year: 1979 });
    const b = title({ title: 'Brazil', rating: 7, year: 1979 });
    expect(rating(a, b)).toBeLessThan(0);
    expect(rating(b, a)).toBeGreaterThan(0);
  });

  it('breaks an equal rating on the title when neither title has a year', () => {
    const rating = compareTitles('rating');
    expect(
      rating(title({ title: 'Alien', rating: 7 }), title({ title: 'Brazil', rating: 7 })),
    ).toBeLessThan(0);
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
      { slug: 'action', name: 'Action', count: 3 },
      { slug: 'drama', name: 'Drama', count: 1 },
      { slug: 'sci-fi', name: 'Sci-Fi', count: 1 },
    ]);
  });

  it('counts one genre once however the library spelled it', () => {
    const items = [
      title({ title: 'a', genres: ['Family'] }),
      title({ title: 'b', genres: ['Familial'] }),
    ];
    expect(collectGenres(items)).toEqual([{ slug: 'family', name: 'Family', count: 2 }]);
  });

  // A genre with neither a row nor a foldable name is dropped, so anything
  // pairing the surviving slugs with the raw `genres` array by POSITION reads
  // its neighbour's name from there on.
  it('names each genre from its own spelling, not the one at its old index', () => {
    const blank = collectGenres([title({ title: 'a', genres: ['  ', 'Horror'] })]);
    expect(blank).toEqual([{ slug: 'horror', name: 'Horror', count: 1 }]);

    const unknown = collectGenres([
      title({ title: 'b', tmdbGenreIds: [10751, 4242, 27], genres: ['Family', '!!!', 'Horror'] }),
    ]);
    expect(unknown.find((g) => g.slug === 'horror')?.name).toBe('Horror');
  });

  it('counts one genre once across the languages its titles were enriched in', () => {
    const items = [
      title({ title: 'a', tmdbGenreIds: [10751], genres: ['Family'] }),
      title({ title: 'b', tmdbGenreIds: [10751], genres: ['Familial'] }),
    ];

    expect(collectGenres(items)).toEqual([{ slug: 'family', name: 'Family', count: 2 }]);
  });

  it('ignores blank/whitespace genres and titles without metadata', () => {
    const items = [title({ title: 'a', genres: ['Action', '  '] }), title({ title: 'b' })];
    expect(collectGenres(items)).toEqual([{ slug: 'action', name: 'Action', count: 1 }]);
  });
});

describe('hasGenre', () => {
  const item = title({ title: 'a', genres: ['Action', 'Comedy'] });

  it('matches a carried genre (trim-tolerant)', () => {
    expect(hasGenre(item, 'Comedy')).toBe(true);
    expect(hasGenre(item, '  Action ')).toBe(true);
  });

  it('matches a title through the provider id it was stored with', () => {
    const stored = title({ title: 'a', tmdbGenreIds: [10765], genres: ['Sci-Fi & Fantasy'] });

    expect(hasGenre(stored, 'Science-Fiction & Fantastique')).toBe(true);
    expect(hasGenre(stored, 'sci-fi-fantasy')).toBe(true);
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
