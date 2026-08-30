import { useEffect, useEffectEvent, useRef } from 'react';

/**
 * What happens when a film reaches its end with nothing queued behind it (§10).
 * A next episode is the credits countdown's business (see usePlayerCredits);
 * this covers everything else, so the player never parks on a dead frame: it
 * offers the next film to watch, and with none to offer it leaves.
 */
export function usePlayerOutro(opts: {
  endedNonce: number;
  hasNext: boolean;
  /** Whether there is a film to offer. False leaves instead. */
  canOffer: boolean;
  onOffer: () => void;
  onLeave: () => void;
}): void {
  const { endedNonce, hasNext, canOffer, onOffer, onLeave } = opts;
  // The count as it stood on mount, so an engine that carries its nonce across a
  // title swap does not fire the outro again on the film that follows.
  const seen = useRef(endedNonce);
  const run = useEffectEvent(() => (canOffer ? onOffer() : onLeave()));

  useEffect(() => {
    if (endedNonce === seen.current || hasNext) return;
    seen.current = endedNonce;
    run();
  }, [endedNonce, hasNext]);
}
