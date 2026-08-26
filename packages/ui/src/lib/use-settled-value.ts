import { useEffect, useState } from 'react';

/**
 * `value`, held back until it has stood still for `delayMs`. The first value is
 * taken at once; every later one waits.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (Object.is(value, settled)) return;
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, settled, delayMs]);

  return settled;
}
