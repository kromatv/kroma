import { describe, expect, it } from 'vitest';
import { MATURITY_LEVELS, MaturityLevel, RatingsCountry } from './maturity';

describe('a maturity level', () => {
  it('reads every one of the six levels as the oldest age it admits', () => {
    expect(MATURITY_LEVELS.map((level) => MaturityLevel.parse(level))).toEqual([
      0, 7, 10, 13, 16, 18,
    ]);
  });

  it('refuses an age that is not a level', () => {
    expect(MaturityLevel.safeParse(12).success).toBe(false);
  });
});

describe('a ratings country', () => {
  it('reads an account that follows its household as no country of its own', () => {
    const read = RatingsCountry.parse({ country: null, household: 'FR', countries: ['DE', 'FR'] });

    expect(read.country).toBeNull();
    expect(read.household).toBe('FR');
  });
});
