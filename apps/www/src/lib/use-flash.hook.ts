import { useEffect, useState } from 'react';

/** A value that falls back to `undefined` `ms` after it was set. Unmounting
 * drops the wait with it. */
export function useFlash<T>(ms: number): [T | undefined, (value: T) => void] {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    if (value === undefined) {
      return undefined;
    }
    const timer = setTimeout(() => setValue(undefined), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return [value, setValue];
}
