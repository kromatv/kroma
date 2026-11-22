import { describe, expect, it } from 'vitest';
import { Metadata } from './credits';

const stored = {
  provider: 'tmdb',
  tmdbId: 603,
  title: 'The Matrix',
  overview: null,
  genres: [],
  tmdbUrl: 'https://www.themoviedb.org/movie/603',
};

describe('Metadata', () => {
  it('reads the rating a reader is shown, with its country and whether it was borrowed', () => {
    const meta = Metadata.parse({
      ...stored,
      certification: 'R',
      ageRating: { label: 'R', country: 'US', borrowed: true },
    });

    expect(meta.ageRating).toEqual({ label: 'R', country: 'US', borrowed: true });
  });

  it('reads a title stored before ratings were kept per country as having none', () => {
    const meta = Metadata.parse({ ...stored, certification: '12' });

    expect(meta.ageRating).toBeUndefined();
    expect(meta.certification).toBe('12');
  });
});
