import { useEffect, useState } from 'react';
import type { ArrivalStallStep } from '../watchable-stall';
import { useArrivalStall } from './arrival-stall';

const FAILURES_SHOWN_AT = 3;

type Spans = readonly (readonly [number, number])[];

/** `bufferedEnd` is the film second its loaded film runs to, NaN where the player
 * cannot say, and is read fresh on every poll. */
export interface ArrivalRecoveryPlayer {
  cur: number;
  dur: number;
  wanted: boolean;
  waiting: boolean;
  failed: boolean;
  started: boolean;
  playing: boolean;
  bufferedEnd(): number;
}

export interface ArrivalRecoveryOptions {
  played: Readonly<ArrivalRecoveryPlayer>;
  arrived: Spans | null;
  arriving: boolean;
  onReopen: (step: ArrivalStallStep, atSec: number) => void;
}

/** Keeps a watch stream going while its film is still arriving. It reopens the
 * stream where it stalled once the film under it has arrived, through `onReopen`,
 * and answers `recovering` while a failure is kept from the viewer: more film can
 * still come, and fewer than three failures ran with no frame played between
 * them. */
export function useArrivalRecovery({
  played,
  arrived,
  arriving,
  onReopen,
}: Readonly<ArrivalRecoveryOptions>): { recovering: boolean } {
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (played.failed) setFailures((count) => count + 1);
  }, [played.failed]);

  useEffect(() => {
    if (played.playing) setFailures(0);
  }, [played.playing]);

  const recovering = played.failed && arriving && failures < FAILURES_SHOWN_AT;

  useArrivalStall(
    () => ({
      atSec: played.cur,
      bufferedSec: played.bufferedEnd(),
      wanted: played.wanted,
      waiting: played.waiting,
      failed: recovering,
      started: played.started,
      arrived,
      durationSec: played.dur,
    }),
    onReopen,
  );

  return { recovering };
}
