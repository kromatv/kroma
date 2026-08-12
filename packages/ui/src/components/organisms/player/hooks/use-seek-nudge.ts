// Directional seeking on the scrub bar: a TAP moves exactly TAP_STEP, a HELD
// press ramps into a continuous scrub, and only one real seek fires once presses
// stop — each seek re-anchors the HLS master, so coalescing them matters.

import { useCallback, useEffect, useRef } from 'react';
import type { PlayerController } from '../types';

const TAP_STEP = 10;
// Sized so the first repeat of a hold covers about as much ground as a tap;
// any less and holding would be slower than tapping repeatedly.
const HOLD_BASE = 120;
const HOLD_GROWTH = 4;
// So even a long hold on a long film stays steerable.
const HOLD_MAX = 1800;
// Well above a remote's repeat interval (~100 ms) and well below the pace of
// deliberate presses, which must stay exactly TAP_STEP apiece.
const REPEAT_MS = 300;
// Longer than REPEAT_MS, so a run of deliberate taps still lands as ONE seek.
const COMMIT_MS = 500;
// Clamp on the gap between two repeats, so a stalled frame cannot jump.
const MAX_TICK_S = 0.25;

interface Burst {
  target: number;
  startedAt: number;
  lastAt: number;
  dir: -1 | 1;
}

/**
 * A directional seek that ramps while the button is held.
 *
 * Returns the `seekNudge(dir)` the nav machine calls for ◀ / ▶ on the progress
 * bar and for the rewind / forward transport buttons.
 */
export function useSeekNudge(controller: PlayerController): (dir: -1 | 1) => void {
  const latest = useRef(controller);
  latest.current = controller;
  const burst = useRef<Burst | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A burst interrupted by unmount must not leave a timer holding the player.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback((dir: -1 | 1) => {
    const c = latest.current;
    const now = Date.now();
    const prev = burst.current;
    // A gap, or a change of direction, is a new gesture: the ramp restarts so
    // reversing out of a fast scrub is immediately precise again.
    const holding = prev?.dir === dir && now - prev.lastAt <= REPEAT_MS;

    let target: number;
    if (holding) {
      const heldS = (now - prev.startedAt) / 1000;
      const speed = Math.min(HOLD_MAX, HOLD_BASE * HOLD_GROWTH ** heldS);
      const tickS = Math.min(MAX_TICK_S, (now - prev.lastAt) / 1000);
      target = prev.target + dir * speed * tickS;
    } else {
      // Continue from the cursor if one is already showing, else the playhead.
      target = (prev?.target ?? c.cur) + dir * TAP_STEP;
    }

    const ceiling = c.dur > 0 ? c.dur - 1 : Number.POSITIVE_INFINITY;
    target = Math.max(0, Math.min(ceiling, target));
    burst.current = {
      target,
      startedAt: holding ? prev.startedAt : now,
      lastAt: now,
      dir,
    };
    c.scrubPreview(target);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      burst.current = null;
      latest.current.scrubCommit();
    }, COMMIT_MS);
  }, []);
}
