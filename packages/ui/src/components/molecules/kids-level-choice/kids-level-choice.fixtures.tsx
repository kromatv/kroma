import type { NewKidsProfile } from '@kromatv/client/admin';
import { useState } from 'react';
import { KidsLevelChoice } from './kids-level-choice.component';

/** The choice as a form holds it: nothing picked until a row is pressed. */
export function Picking() {
  const [level, setLevel] = useState<NewKidsProfile['level'] | null>(null);
  return <KidsLevelChoice value={level} onValueChange={setLevel} />;
}
