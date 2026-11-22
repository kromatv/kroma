import { countryOptions } from '@kromatv/core';
import { useMemo } from 'react';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { type ControlSize, useEntryDefaults } from '#ui/lib/field-shell';
import { useLocaleDefault } from '#ui/services/i18n';

export interface CountryChoiceProps {
  /** ISO 3166 codes, named for the reader's language and sorted by name. */
  countries: readonly string[];
  /** `null` until one is known: no row is picked. */
  value: string | null;
  onValueChange: (country: string) => void;
  /** The list's accessible name. */
  label: string;
  /** Defaults to the form factor's control size, as a `ListRow` beside it does. */
  size?: ControlSize;
}

/** A country picked from a list, one row each, named in the reader's
 *  language. */
export function CountryChoice({
  countries,
  value,
  onValueChange,
  label,
  size,
}: Readonly<CountryChoiceProps>) {
  const locale = useLocaleDefault();
  const entry = useEntryDefaults();
  const rows = useMemo(() => countryOptions(countries, locale), [countries, locale]);
  return (
    <ChoiceList.Root
      size={size ?? entry.size}
      label={label}
      value={value ?? ''}
      onValueChange={onValueChange}
    >
      {rows.map((row) => (
        <ChoiceList.Item key={row.code} value={row.code}>
          <ChoiceList.Label>{row.label}</ChoiceList.Label>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}
