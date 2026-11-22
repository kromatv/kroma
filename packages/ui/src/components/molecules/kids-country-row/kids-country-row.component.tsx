import { countryName } from '@kromatv/core';
import { ListRow } from '#ui/components/molecules/list-row';
import { useLocaleDefault, useTDefault } from '#ui/services/i18n';

export interface KidsCountryRowProps {
  /** The ratings country the form shows; `null` until it is known, when the row is not drawn. */
  country: string | null;
  /** Opens the list the country is picked from. */
  onPress: () => void;
}

/** A Kids form's ratings country as one row, named in the reader's language. */
export function KidsCountryRow({ country, onPress }: Readonly<KidsCountryRowProps>) {
  const t = useTDefault();
  const locale = useLocaleDefault();
  if (country === null) {
    return null;
  }
  return (
    <ListRow.Root icon="world" onPress={onPress}>
      <ListRow.Label>{t('admin.kidsCountry')}</ListRow.Label>
      <ListRow.Hint>{countryName(country, locale)}</ListRow.Hint>
    </ListRow.Root>
  );
}
