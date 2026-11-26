import type { RatingsCountry } from '@kromatv/client/accounts';
import { countryName, countryOptions } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { RATINGS_HOUSEHOLD } from '#web/features/accounts/account/use-ratings-country.hook';

interface RatingsChoice {
  value: string;
  label: string;
}

/** What an account can pick for its age ratings, named for `locale`: the server's
 *  country first, then every other country by name. */
export function ratingsChoices(
  ratings: RatingsCountry,
  { t, locale }: Readonly<{ t: Translate; locale: string }>,
): RatingsChoice[] {
  const household = {
    value: RATINGS_HOUSEHOLD,
    label: t('account.ratingsCountryHousehold', {
      country: countryName(ratings.household, locale),
    }),
  };
  const countries = countryOptions(ratings.countries, locale).map(({ code, label }) => ({
    value: code,
    label,
  }));
  return [household, ...countries];
}

/** The value a picker shows for the country an account reads its ratings in. */
export function ratingsValue(ratings: RatingsCountry): string {
  return ratings.country ?? RATINGS_HOUSEHOLD;
}
