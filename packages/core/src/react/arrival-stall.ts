import { useEffect, useRef } from 'react';
import {
  ARRIVAL_STALL_POLL_MS,
  type ArrivalStallSample,
  type ArrivalStallStep,
  arrivalStallWatch,
} from '../watchable-stall';

/**
 * Opens a stalled watch stream again at its playhead once the film under it has
 * arrived. It calls the latest render's `read` once a second, so a player that
 * stopped reporting its time is still watched and what it has loaded is read
 * fresh.
 */
export function useArrivalStall(
  read: () => Readonly<ArrivalStallSample>,
  onReopen: (step: ArrivalStallStep, atSec: number) => void,
): void {
  const live = useRef({ read, onReopen });
  live.current = { read, onReopen };

  useEffect(() => {
    const watch = arrivalStallWatch();
    const id = setInterval(() => {
      const now = live.current;
      const sample = now.read();
      const step = watch.observe(sample, Date.now());
      if (step) now.onReopen(step, sample.atSec);
    }, ARRIVAL_STALL_POLL_MS);
    return () => clearInterval(id);
  }, []);
}
