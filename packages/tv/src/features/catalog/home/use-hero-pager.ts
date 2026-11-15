import { useReducedMotion } from '@kromatv/ui/kit';
import { useCallback, useEffect, useState } from 'react';

export const HERO_DWELL_MS = 10_000;

interface HeroPager {
  index: number;
  page: (by: 1 | -1) => void;
  touch: () => void;
}

/** Which of `count` hero entries is shown. It moves on by itself after a dwell
 * with no `touch`, only while `held` and never under reduced motion, and stops
 * for good once `page` was called. */
export function useHeroPager(count: number, held: boolean): HeroPager {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [pagedByHand, setPagedByHand] = useState(false);
  const [presses, setPresses] = useState(0);
  const shown = index < count ? index : 0;
  const playing = held && !pagedByHand && !reducedMotion && count > 1;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const dwell = setTimeout(() => setIndex((shown + 1) % count), HERO_DWELL_MS);
    return () => clearTimeout(dwell);
  }, [playing, shown, count, presses]);

  const page = useCallback(
    (by: 1 | -1) => {
      if (count < 2) {
        return;
      }
      setPagedByHand(true);
      setIndex((at) => ((at < count ? at : 0) + by + count) % count);
    },
    [count],
  );
  const touch = useCallback(() => setPresses((n) => n + 1), []);

  return { index: shown, page, touch };
}
