import { useState } from 'react';
import { CountryChoice } from './country-choice.component';

export function Picking() {
  const [country, setCountry] = useState<string | null>('CH');
  return (
    <CountryChoice
      label="Ratings country"
      countries={['CH', 'DE', 'FR', 'GB', 'US']}
      value={country}
      onValueChange={setCountry}
    />
  );
}
