import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_AFTER_MS = 4000;

export interface ChromeReveal {
  shown: boolean;
  poke(): void;
  toggle(): void;
  hold(): () => void;
}

/** When a phone player shows its controls: up on arrival, up on a touch, and
 * gone four seconds after the last one. `hold` keeps them up until the release it
 * hands back runs, for a scrub in flight or a finger resting on a control, and
 * the four seconds count from the last release. */
export function useChromeReveal(): ChromeReveal {
  const [shown, setShown] = useState(true);
  const up = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holds = useRef(0);

  const show = useCallback((next: boolean) => {
    up.current = next;
    setShown(next);
  }, []);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = holds.current > 0 ? null : setTimeout(() => show(false), HIDE_AFTER_MS);
  }, [show]);

  const poke = useCallback(() => {
    show(true);
    arm();
  }, [show, arm]);

  const toggle = useCallback(() => {
    if (!up.current || holds.current > 0) {
      poke();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    show(false);
  }, [show, poke]);

  const hold = useCallback(() => {
    holds.current += 1;
    poke();
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      holds.current -= 1;
      arm();
    };
  }, [poke, arm]);

  useEffect(() => {
    arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arm]);

  return { shown, poke, toggle, hold };
}
