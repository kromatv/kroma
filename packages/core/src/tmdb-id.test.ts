import { expect, it } from 'vitest';
import { tmdbIdOf } from './tmdb-id';

it('keeps the id of a title TMDB described', () => {
  expect(tmdbIdOf(949)).toBe(949);
});

it('reads a record TMDB never described as no id at all', () => {
  expect(tmdbIdOf(0)).toBeNull();
  expect(tmdbIdOf(null)).toBeNull();
  expect(tmdbIdOf(undefined)).toBeNull();
});
