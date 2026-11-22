import { CountryChoice } from '#ui/components/molecules/country-choice';
import { useTDefault } from '#ui/services/i18n';

export interface KidsCountryChoiceProps {
  /** The country a Kids form shows, the ones it may be, and the pick that changes it. */
  country: {
    country: string | null;
    countries: readonly string[];
    pick: (country: string) => void;
  };
  /** Called once a country is picked, to leave the list. */
  onPicked: () => void;
}

/** The list a Kids form's ratings country is picked from: a pick changes the
 *  form's country and leaves the list. */
export function KidsCountryChoice({ country, onPicked }: Readonly<KidsCountryChoiceProps>) {
  const t = useTDefault();
  const pick = (picked: string) => {
    country.pick(picked);
    onPicked();
  };
  return (
    <CountryChoice
      label={t('admin.kidsCountry')}
      countries={country.countries}
      value={country.country}
      onValueChange={pick}
    />
  );
}
