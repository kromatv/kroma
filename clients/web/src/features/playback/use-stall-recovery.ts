import { driveStallRecovery, reachableBufferEnd, recoverMse, STALL_NUDGE_SEC } from '@kroma/core';
import { useEffect, useState } from 'react';
import type { HlsInstance, ShakaPlayerLike } from '#web/features/playback/video-engine';

export interface StallRecoveryOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hlsRef: { current: HlsInstance | null };
  shakaRef: { current: ShakaPlayerLike | null };
  baseSec: number;
  active: boolean;
  onRestart: (absSec: number) => void;
}

/**
 * Works a stuck playhead back up: a nudge, then the engine's own recovery, then
 * a fresh source at the same position. Returns whether it is stuck right now,
 * which the chrome shows as buffering rather than as a healthy full bar.
 */
export function useStallRecovery(opts: StallRecoveryOptions): boolean {
  const { videoRef, hlsRef, shakaRef, baseSec, active, onRestart } = opts;
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!active || !v) return;
    return driveStallRecovery(
      {
        sample: () => ({
          currentTime: v.currentTime,
          bufferedEnd: reachableBufferEnd(v.buffered, v.currentTime),
          paused: v.paused,
          ended: v.ended,
          seeking: v.seeking,
          readyState: v.readyState,
        }),
        nudge: () => {
          v.currentTime += STALL_NUDGE_SEC;
        },
        recover: () => recoverMse(shakaRef.current, hlsRef.current),
        restart: () => onRestart(baseSec + v.currentTime),
      },
      setStalled,
    );
  }, [active, baseSec, onRestart, videoRef, hlsRef, shakaRef]);

  return stalled;
}
