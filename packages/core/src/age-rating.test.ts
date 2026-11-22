import { describe, expect, it } from 'vitest';
import { ageRatingOf } from './age-rating';

describe('ageRatingOf', () => {
  it('hands the badge the rating the reader is shown, borrowed or not', () => {
    const own = { label: '12', country: 'FR', borrowed: false };
    const borrowed = { label: 'R', country: 'US', borrowed: true };

    expect(ageRatingOf({ ageRating: own })).toEqual(own);
    expect(ageRatingOf({ ageRating: borrowed })).toEqual(borrowed);
  });

  it('hands it nothing for a title nobody rated or one with no metadata yet', () => {
    expect(ageRatingOf({ ageRating: null })).toBeNull();
    expect(ageRatingOf({})).toBeNull();
    expect(ageRatingOf(null)).toBeNull();
    expect(ageRatingOf(undefined)).toBeNull();
  });
});
