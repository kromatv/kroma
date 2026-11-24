import { useCallback, useEffect, useRef } from 'react';

/** `setTimeout` owned by the calling component: a callback still waiting when
 * it unmounts never runs. */
export function useLater(): (run: () => void, ms: number) => void {
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return useCallback((run: () => void, ms: number) => {
    const timer = setTimeout(() => {
      pending.current.delete(timer);
      run();
    }, ms);
    pending.current.add(timer);
  }, []);
}
