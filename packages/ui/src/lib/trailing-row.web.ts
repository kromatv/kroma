import { startTransition, useEffect, useState } from 'react';

/** The row a grid's mounted window trails behind the focus, caught up once presses settle. */
export function useTrailingRow(focused: number, settleMs: number): number {
  const [settled, setSettled] = useState(focused);
  useEffect(() => {
    if (settled === focused) return;
    const timer = setTimeout(() => startTransition(() => setSettled(focused)), settleMs);
    return () => clearTimeout(timer);
  }, [focused, settled, settleMs]);
  return settled;
}
