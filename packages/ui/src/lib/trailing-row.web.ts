import { startTransition, useEffect, useState } from 'react';

/** The row a grid's mounted window trails behind the focus, or null where the window follows the focus at once. */
export function useTrailingRow(focused: number, settleMs: number): number | null {
  const [settled, setSettled] = useState(focused);
  useEffect(() => {
    if (settled === focused) return;
    const timer = setTimeout(() => startTransition(() => setSettled(focused)), settleMs);
    return () => clearTimeout(timer);
  }, [focused, settled, settleMs]);
  return settled;
}
