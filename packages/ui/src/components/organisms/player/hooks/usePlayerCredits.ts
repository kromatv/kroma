import type { Marker } from '@kroma/core';
import { useCallback, useEffect, useRef, useState } from 'react';

/** No credits marker → treat the last CREDITS_TAIL seconds as the credits. */
const CREDITS_TAIL = 30;
/** Circular timer length before auto-advancing the next episode (§11). */
const AUTO_NEXT = 5;

export interface CreditsState {
  show: boolean;
  secondsLeft: number;
  total: number;
  cancel: () => void;
}

/**
 * Credits-aware next-episode autoplay (§11). Shows the card once playback enters
 * the `credits` marker (or the last {@link CREDITS_TAIL}s when unmarked), runs a
 * fixed 5s countdown that advances at 0, and also advances on the real end. The
 * countdown is frozen during a scrub, so seeking near the end never teleports.
 */
export function usePlayerCredits(opts: {
  markers?: readonly Marker[];
  dur: number;
  cur: number;
  seeking: boolean;
  endedNonce: number;
  hasNext: boolean;
  onAdvance: () => void;
}): CreditsState {
  const { markers, dur, cur, seeking, endedNonce, hasNext, onAdvance } = opts;
  const [cancelled, setCancelled] = useState(false);
  const advancedRef = useRef(false);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  }, [onAdvance]);

  const credits = (markers ?? []).find((m) => m.kind === 'credits');
  const creditsAt = credits ? credits.startMs / 1000 : dur - CREDITS_TAIL;
  const show = hasNext && !cancelled && !seeking && creditsAt > 0 && cur >= creditsAt;

  const [secondsLeft, setSecondsLeft] = useState(AUTO_NEXT);
  useEffect(() => {
    setSecondsLeft(AUTO_NEXT);
    if (!show) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [show]);

  useEffect(() => {
    if (show && secondsLeft === 0) advance();
  }, [show, secondsLeft, advance]);

  // Reaching the real end advances too (covers streams that stop early).
  useEffect(() => {
    if (endedNonce > 0 && hasNext && !cancelled) advance();
  }, [endedNonce, hasNext, cancelled, advance]);

  return { show, secondsLeft, total: AUTO_NEXT, cancel: useCallback(() => setCancelled(true), []) };
}
