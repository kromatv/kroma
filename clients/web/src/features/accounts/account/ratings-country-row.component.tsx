import type { RatingsCountry } from '@kromatv/client/accounts';
import { countryName, countryOptions } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import { ListRow, Select, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PrefRow, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

const HOUSEHOLD = 'household';
const RATINGS_COUNTRY = ['account', 'ratings-country'] as const;

function useRatingsCountry() {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const save = useSave();
  const ratings = useQuery({
    queryKey: RATINGS_COUNTRY,
    queryFn: () => client.accounts.ratings.get(),
  });
  const choose = (value: string) =>
    void save.run(async () => {
      const saved = await client.accounts.ratings.set(value === HOUSEHOLD ? null : value);
      queryClient.setQueryData(RATINGS_COUNTRY, saved);
    }, t('account.saveFailed'));
  return { ratings: ratings.data, save, choose };
}

function CountrySelect({
  ratings,
  onPick,
}: Readonly<{ ratings: RatingsCountry; onPick: (value: string) => void }>) {
  const t = useT();
  const locale = useLocale();
  const options = useMemo(() => countryOptions(ratings.countries, locale), [ratings, locale]);
  return (
    <Select.Root
      label={t('account.ratingsCountry')}
      value={ratings.country ?? HOUSEHOLD}
      onValueChange={onPick}
    >
      <Select.Trigger />
      <Select.Item
        value={HOUSEHOLD}
        label={t('account.ratingsCountryHousehold', {
          country: countryName(ratings.household, locale),
        })}
      />
      {options.map((option) => (
        <Select.Item key={option.code} value={option.code} label={option.label} />
      ))}
    </Select.Root>
  );
}

/** Whose age ratings the account's badges show (ACCT-104), saved the moment it
 * is picked. The server answers every title in that country's labels from the
 * next request on, and tells the account's other screens to refresh. */
export function RatingsCountryRow() {
  const t = useT();
  const { ratings, save, choose } = useRatingsCountry();
  if (!ratings) {
    return null;
  }
  return (
    <>
      <PrefRow
        icon="world"
        label={t('account.ratingsCountry')}
        desc={t('account.ratingsCountryDesc')}
        control={<CountrySelect ratings={ratings} onPick={choose} />}
      />
      {save.status === 'error' ? (
        <ListRow.Root>
          <Text variant="meta" color="danger">
            {save.error}
          </Text>
        </ListRow.Root>
      ) : null}
    </>
  );
}
