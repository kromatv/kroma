import { driveStallRecovery } from '@kroma/core';
import { useEffect, useState } from 'react';
import type { TvEngine } from '#tv/features/playback/player/engine';

/**
 * Works a stuck playhead back up on whichever engine is playing: a nudge, then
 * the backend's own recovery, then a fresh source at the same position. Returns
 * whether it is stuck right now, which the chrome shows as buffering rather than
 * as a healthy full bar.
 */
export function useStallGuard(
  engineRef: React.RefObject<TvEngine | null>,
  active: boolean,
): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const engine = engineRef.current;
    if (!active || !engine) return;
    return driveStallRecovery(
      {
        sample: () => {
          const bufferedEnd = engine.bufferedEnd();
          if (bufferedEnd == null) return null;
          return { currentTime: engine.position(), bufferedEnd, paused: engine.isPaused() };
        },
        nudge: () => engine.nudge(),
        recover: () => engine.recoverStall?.() === true,
        restart: () => engine.restart(engine.position()),
      },
      setStalled,
    );
  }, [active, engineRef]);

  return stalled;
}
