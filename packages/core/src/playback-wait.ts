const HAVE_CURRENT_DATA = 2;
const HAVE_FUTURE_DATA = 3;
const NETWORK_LOADING = 2;
const FROZEN_MS = 750;
const MOVED_SEC = 0.01;

/** Why a picture that should be on screen, or moving, is not: `loading` until
 * the frame asked for is there, `buffering` when a playing film ran out of data. */
export type WaitReason = 'loading' | 'buffering';

/** One read of a media element, with what the player meant it to be doing. */
export interface WaitSample {
  /** A play is wanted: the element is playing, or is about to be told to. */
  intent: boolean;
  /** A source is on its way and not yet on the element. */
  attaching: boolean;
  readyState: number;
  networkState: number;
  seeking: boolean;
  ended: boolean;
  /** The playhead has sat still while the element was playing (see `playheadWatch`). */
  frozen: boolean;
}

/**
 * What the viewer is waiting on, or null when there is nothing to wait for:
 * playing, paused on a frame, or finished. Read off the element's own state
 * rather than its events, so a remount, a seek while paused or a load that never
 * fires `waiting` still counts.
 */
export function waitReason(s: WaitSample): WaitReason | null {
  if (s.ended) return null;
  if (s.attaching || s.seeking) return 'loading';
  if (s.readyState < HAVE_CURRENT_DATA) {
    return s.intent || s.networkState === NETWORK_LOADING ? 'loading' : null;
  }
  if (s.intent && (s.readyState < HAVE_FUTURE_DATA || s.frozen)) return 'buffering';
  return null;
}

/** Watches the clock of an element that should be playing. */
export interface PlayheadWatch {
  observe(currentTime: number, playing: boolean, nowMs: number): boolean;
}

/**
 * Tells a stopped playhead from a moving one, which `readyState` cannot: an MSE
 * element parked at the end of what it has appended can go on reporting
 * `HAVE_ENOUGH_DATA` while nothing moves. `observe` answers true once an element
 * that is playing has not moved its clock for `FROZEN_MS`; a pause starts the
 * count over.
 */
export function playheadWatch(): PlayheadWatch {
  let counting = false;
  let mark = 0;
  let since = 0;
  return {
    observe(currentTime, playing, nowMs) {
      if (!playing) {
        counting = false;
        return false;
      }
      if (!counting || Math.abs(currentTime - mark) > MOVED_SEC) {
        counting = true;
        mark = currentTime;
        since = nowMs;
        return false;
      }
      return nowMs - since >= FROZEN_MS;
    },
  };
}
