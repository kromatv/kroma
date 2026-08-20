import type { CastReceiver } from '@kroma/core';

/** What a receiver last reported, and when this sender heard it. */
interface PositionBase {
  id: string;
  positionMs: number;
  playing: boolean;
  at: number;
}

/** Where the TV is *now*: what it last told us, plus the wall time since. The
 * roster snapshot and the position event race, so the fresher of the two wins,
 * and the result never runs past the title's own duration. */
function livePosition(
  active: CastReceiver | null,
  base: PositionBase | null,
  playing: boolean,
): number {
  const reported = active?.nowPlaying?.positionMs ?? 0;
  const from = base && base.id === active?.id ? base : null;
  const start = from ? Math.max(from.positionMs, reported) : reported;
  const elapsed = from && (from.playing || playing) ? Math.max(0, Date.now() - from.at) : 0;
  const duration = active?.nowPlaying?.durationMs;
  const out = start + elapsed;
  return duration ? Math.min(out, duration) : out;
}

export type { PositionBase };
export { livePosition };
