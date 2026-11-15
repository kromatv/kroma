import { useReducedMotion } from '@kromatv/ui/kit';
import { useCallback, useEffect, useState } from 'react';

export const HERO_DWELL_MS = 10_000;

interface HeroPager {
  index: number;
  page: (by: 1 | -1) => void;
  touch: () => void;
}

interface HeroPagerOptions {
  count: number;
  held: boolean;
}

interface Position {
  index: number;
}

const shownOf = ({ index }: Position, count: number) => (index < count ? index : 0);

/** Which of `count` hero entries is shown. It moves on by itself after a dwell
 * with no `touch`, only while `held` and never under reduced motion, and stops
 * for good once `page` was called. */
export function useHeroPager({ count, held }: HeroPagerOptions): HeroPager {
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState<Position>({ index: 0 });
  const [pagedByHand, setPagedByHand] = useState(false);
  const playing = held && !pagedByHand && !reducedMotion && count > 1;

  useEffect(() => {
    if (!playing) {
      return undefined;
    }
    const next = (shownOf(position, count) + 1) % count;
    const dwell = setTimeout(() => setPosition({ index: next }), HERO_DWELL_MS);
    return () => clearTimeout(dwell);
  }, [playing, position, count]);

  const page = useCallback(
    (by: 1 | -1) => {
      if (count < 2) {
        return;
      }
      setPagedByHand(true);
      setPosition((at) => ({ index: (shownOf(at, count) + by + count) % count }));
    },
    [count],
  );
  const touch = useCallback(() => setPosition((at) => ({ index: at.index })), []);

  return { index: shownOf(position, count), page, touch };
}
