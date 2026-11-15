import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** How long one slide holds before the next one takes its place. */
export const HOLD_MS = 9000;

function onVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function useTabHidden(): boolean {
  return useSyncExternalStore(
    onVisibility,
    () => document.visibilityState === 'hidden',
    () => false,
  );
}

export interface Carousel {
  index: number;
  running: boolean;
  stopped: boolean;
  go: (to: number) => void;
  step: (by: number) => void;
  toggle: () => void;
}

/**
 * Which of `count` slides is up. It advances every `holdMs` unless `resting`
 * (the pointer or the keyboard is on it), the tab is hidden, or the viewer
 * paused it. Paging by hand restarts the hold, so a slide just chosen is not
 * taken away a second later.
 */
export function useCarousel(count: number, resting: boolean, holdMs: number = HOLD_MS): Carousel {
  const [at, setAt] = useState(0);
  const [stopped, setStopped] = useState(false);
  const hidden = useTabHidden();
  const index = count === 0 ? 0 : Math.min(at, count - 1);
  const running = count > 1 && !stopped && !resting && !hidden;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setAt((index + 1) % count), holdMs);
    return () => clearTimeout(timer);
  }, [running, index, count, holdMs]);

  const go = useCallback(
    (to: number) => {
      if (count > 0) setAt(((to % count) + count) % count);
    },
    [count],
  );
  const step = useCallback((by: number) => go(index + by), [go, index]);
  const toggle = useCallback(() => setStopped((was) => !was), []);

  return { index, running, stopped, go, step, toggle };
}
