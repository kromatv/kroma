import type { Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { ratingsChoices, ratingsValue } from './ratings-choices';

const t: Translate = (key: string, vars?: object) => `${key}${JSON.stringify(vars ?? {})}`;

const RATINGS = { country: null, household: 'CH', countries: ['US', 'DE', 'FR'] };

describe('ratingsChoices', () => {
  it('offers the server’s country first, named after that country', () => {
    expect(ratingsChoices(RATINGS, { t, locale: 'en' })[0]).toEqual({
      value: 'household',
      label: 'account.ratingsCountryHousehold{"country":"Switzerland"}',
    });
  });

  it('then every country, by its name in the reader’s language', () => {
    expect(ratingsChoices(RATINGS, { t, locale: 'en' }).slice(1)).toEqual([
      { value: 'FR', label: 'France' },
      { value: 'DE', label: 'Germany' },
      { value: 'US', label: 'United States' },
    ]);
  });
});

describe('ratingsValue', () => {
  it('reads no country of its own as the server’s', () => {
    expect(ratingsValue(RATINGS)).toBe('household');
  });

  it('reads the account’s own country', () => {
    expect(ratingsValue({ ...RATINGS, country: 'DE' })).toBe('DE');
  });
});
