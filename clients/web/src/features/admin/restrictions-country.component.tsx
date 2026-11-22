import type { Restrictions } from '@kromatv/client/admin';
import { countryName } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import { useQuery } from '@tanstack/react-query';
import { KidsCountrySelect } from '#web/features/admin/kids-country-select.component';
import { useAuth } from '#web/shared/lib/auth';

const HOUSEHOLD = 'household';

/** The ratings country an admin sets for another profile among its
 * restrictions (ACCT-150): the household's, or one the admin picks. The
 * countries on offer are the ones the admin's own setting lists. */
export function RestrictionsCountry({
  read,
  disabled,
  onPick,
}: Readonly<{ read: Restrictions; disabled: boolean; onPick: (country: string | null) => void }>) {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const ratings = useQuery({
    queryKey: ['account', 'ratings-country'],
    queryFn: () => client.accounts.ratings.get(),
  });
  const household = read.household ?? ratings.data?.household;
  const follow = household
    ? {
        value: HOUSEHOLD,
        label: t('account.ratingsCountryHousehold', { country: countryName(household, locale) }),
      }
    : undefined;
  return (
    <KidsCountrySelect
      countries={ratings.data?.countries ?? []}
      value={read.ratingsCountry ?? HOUSEHOLD}
      disabled={disabled}
      household={follow}
      onPick={(picked) => onPick(picked === HOUSEHOLD ? null : picked)}
    />
  );
}
