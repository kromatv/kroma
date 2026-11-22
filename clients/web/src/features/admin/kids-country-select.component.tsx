import { countryOptions } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import { Select } from '@kromatv/ui/kit';
import { useMemo } from 'react';

interface KidsCountrySelectProps {
  countries: readonly string[];
  value: string | null;
  onPick: (country: string) => void;
  disabled?: boolean;
  household?: { value: string; label: string };
}

/** A Kids profile's ratings country, picked among `countries`, with a first
 * row of its own when the profile may follow the household's. Hidden until a
 * country is known. */
export function KidsCountrySelect({
  countries,
  value,
  onPick,
  disabled = false,
  household,
}: Readonly<KidsCountrySelectProps>) {
  const t = useT();
  const locale = useLocale();
  const options = useMemo(() => countryOptions(countries, locale), [countries, locale]);
  if (value === null || options.length === 0) {
    return null;
  }
  return (
    <Select.Root
      label={t('admin.kidsCountry')}
      value={value}
      disabled={disabled}
      onValueChange={onPick}
    >
      <Select.Trigger />
      {household ? <Select.Item value={household.value} label={household.label} /> : null}
      {options.map((option) => (
        <Select.Item key={option.code} value={option.code} label={option.label} />
      ))}
    </Select.Root>
  );
}
