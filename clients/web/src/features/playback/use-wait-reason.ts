import { playheadWatch, type WaitReason, waitReason } from '@kromatv/core';
import { type RefObject, useEffect, useState } from 'react';

const EVENTS = [
  'loadstart',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'canplaythrough',
  'playing',
  'waiting',
  'seeking',
  'seeked',
  'play',
  'pause',
  'ended',
  'emptied',
  'suspend',
  'stalled',
  'error',
] as const;

const POLL_MS = 250;

export interface WaitWatch {
  videoRef: RefObject<HTMLVideoElement | null>;
  intent: boolean;
  attaching: boolean;
  stuck: boolean;
  remount: string;
}

/** What the viewer is waiting on right now (see `waitReason`), re-read on every
 * element event that can change it and on a poll that also watches the playhead
 * move, for the waits that change no state and fire no event. */
export function useWaitReason({
  videoRef,
  intent,
  attaching,
  stuck,
  remount,
}: WaitWatch): WaitReason | null {
  const [reason, setReason] = useState<WaitReason | null>(attaching ? 'loading' : null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `remount` is the trigger; the <video> is keyed by it.
  useEffect(() => {
    const v = videoRef.current;
    const playhead = playheadWatch();
    const read = () => {
      if (!v) {
        setReason(attaching ? 'loading' : null);
        return;
      }
      const playing = intent && !v.paused && !v.seeking && !v.ended;
      setReason(
        waitReason({
          intent,
          attaching,
          readyState: v.readyState,
          networkState: v.networkState,
          seeking: v.seeking,
          ended: v.ended,
          frozen: stuck || playhead.observe(v.currentTime, playing, Date.now()),
        }),
      );
    };
    read();
    if (!v) return;
    for (const type of EVENTS) v.addEventListener(type, read);
    const poll = setInterval(read, POLL_MS);
    return () => {
      for (const type of EVENTS) v.removeEventListener(type, read);
      clearInterval(poll);
    };
  }, [videoRef, intent, attaching, stuck, remount]);

  return reason;
}
