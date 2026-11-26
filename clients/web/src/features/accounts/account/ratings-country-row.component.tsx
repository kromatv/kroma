import type { RatingsCountry } from '@kromatv/client/accounts';
import { useLocale, useT } from '@kromatv/ui';
import { ListRow, Select, Text } from '@kromatv/ui/kit';
import { useMemo } from 'react';
import { ratingsChoices, ratingsValue } from '#web/features/accounts/account/ratings-choices';
import { PrefRow, useSave } from '#web/features/accounts/account/ui';
import { useRatingsCountry } from '#web/features/accounts/account/use-ratings-country.hook';

function CountrySelect({
  ratings,
  onPick,
}: Readonly<{ ratings: RatingsCountry; onPick: (value: string) => void }>) {
  const t = useT();
  const locale = useLocale();
  const choices = useMemo(() => ratingsChoices(ratings, { t, locale }), [ratings, t, locale]);
  return (
    <Select.Root
      label={t('account.ratingsCountry')}
      value={ratingsValue(ratings)}
      onValueChange={onPick}
    >
      <Select.Trigger />
      {choices.map((choice) => (
        <Select.Item key={choice.value} value={choice.value} label={choice.label} />
      ))}
    </Select.Root>
  );
}

/** Whose age ratings the account's badges show (ACCT-104), saved the moment it
 * is picked. The server answers every title in that country's labels from the
 * next request on, and tells the account's other screens to refresh. */
export function RatingsCountryRow() {
  const t = useT();
  const { ratings, choose } = useRatingsCountry();
  const save = useSave();
  const pick = (value: string) => void save.run(() => choose(value), t('account.saveFailed'));
  if (!ratings) {
    return null;
  }
  return (
    <>
      <PrefRow
        icon="world"
        label={t('account.ratingsCountry')}
        desc={t('account.ratingsCountryDesc')}
        control={<CountrySelect ratings={ratings} onPick={pick} />}
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
