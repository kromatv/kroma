// Directional seeking on the scrub bar.
//
// A press used to be a flat ten seconds, committed immediately. On a two-hour
// film that is a cursor that barely moves, and holding the direction issued a
// real seek per repeat - a stutter of re-anchors instead of travel.
//
// So the two gestures are told apart, the way a remote's users expect:
//
//   TAP   a single press is exactly TAP_STEP, precise and predictable.
//   HOLD  a press the remote is auto-repeating becomes a continuous scrub whose
//         SPEED ramps the longer it is held - slow enough at first to stop on a
//         scene, then fast enough to cross a whole film.
//
// The cursor moves the whole time (the scrub bar previews the running target)
// and exactly ONE real seek is issued, once the presses stop. That matters on
// the anchored HLS master, where every seek is a new server anchor.

import { useCallback, useEffect, useRef } from 'react';
import type { PlayerController } from '../types';

/** One deliberate press. */
const TAP_STEP = 10;
/**
 * Media-seconds travelled per real second at the START of a hold.
 *
 * Sized so the first repeat of a held button covers about as much ground as a
 * tap does. Any less and holding the button is SLOWER than pressing it
 * repeatedly, which is the opposite of what a hold is for - the first draft got
 * this wrong (30 s/s over a ~80 ms repeat is 2.4 s a press, against a tap's 10).
 */
const HOLD_BASE = 120;
/** Exponential growth of the hold speed, per second held. */
const HOLD_GROWTH = 4;
/** Speed ceiling, so even a long hold on a long film stays steerable. */
const HOLD_MAX = 1800;
/** Presses closer together than this are the remote auto-repeating, i.e. a hold.
 *  Well above a remote's repeat interval (~100 ms) and well below the pace of
 *  deliberate presses, which must stay exactly TAP_STEP apiece. */
const REPEAT_MS = 300;
/** Idle after the last press before the accumulated target is committed. Longer
 *  than REPEAT_MS, so a run of deliberate taps still lands as ONE seek. */
const COMMIT_MS = 500;
/** Clamp on the gap between two repeats, so a stalled frame cannot jump. */
const MAX_TICK_S = 0.25;

interface Burst {
  /** Absolute target the cursor is currently showing. */
  target: number;
  /** When the hold began, for the speed ramp. */
  startedAt: number;
  /** When the last press arrived. */
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
