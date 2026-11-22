import { useState } from 'react';
import { KidsCountryChoice } from './kids-country-choice.component';

export function Picking() {
  const [country, setCountry] = useState<string | null>('CH');
  const held = { country, countries: ['CH', 'DE', 'FR'], pick: setCountry };
  return <KidsCountryChoice country={held} onPicked={() => undefined} />;
}
