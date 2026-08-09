// The KROMA brand mark and the 10-foot wall clock.

import { Logo } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';

/** The KROMA brand lockup: the wordmark with the chromatic-wheel O. `size` keeps
 * its historical meaning (rough lockup height) and maps onto the shared Logo's
 * lockup height (= wheel diameter). */
export function KromaMark({ size = 30 }: Readonly<{ size?: number }>) {
  return <Logo size={Math.round(size * 0.82)} />;
}

/** The lockup's size on the gate: the sign-in screens are read across a room
 * with nothing else on them, so the mark is the one thing that must carry at
 * that distance. Stated once here rather than as a different number on each of
 * the six screens, which is how they drifted between 32 and 40 in the first
 * place. The browse chrome keeps its own smaller mark - there it sits in a
 * navigation bar, not alone on a title card. */
export const GATE_MARK = 56;

/** Live wall clock ("20:15"): 24-hour, updated each minute. */
export function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
