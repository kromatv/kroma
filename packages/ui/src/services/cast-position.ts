import type { CastNowPlaying, CastReceiver } from '@kromatv/client/cast';

/** What the position is read from: a roster row, by the few fields that say
 * where its playhead is. */
interface Positioned {
  id: CastReceiver['id'];
  nowPlaying?: Pick<CastNowPlaying, 'positionMs' | 'durationMs' | 'state'>;
}

/** The last thing the driven television said about its playhead, and when
 * this sender heard it. It is the one source of the position: a roster row, a
 * position beat and a seek sent from here each replace it whole. */
interface PositionBase {
  id: string;
  positionMs: number;
  playing: boolean;
  at: number;
}

/** The base a roster row gives, or `null` for a television playing nothing. */
function baseOf(receiver: Positioned, at = Date.now()): PositionBase | null {
  const playing = receiver.nowPlaying;
  if (!playing) {
    return null;
  }
  return {
    id: receiver.id,
    positionMs: playing.positionMs,
    playing: playing.state === 'playing',
    at,
  };
}

/** The base after a seek sent from here: the position asked for, at once. The
 * television's own report replaces it within a beat. */
function seekedBase(base: PositionBase | null, id: string, positionMs: number): PositionBase {
  return { id, positionMs, playing: base?.playing ?? true, at: Date.now() };
}

/** Where the television is now: what it last said, plus the time since while
 * it plays, never past the title's own duration. Before anything was heard
 * for this television, it is where the roster last had it. */
function livePosition(
  active: Positioned | null,
  base: PositionBase | null,
  now = Date.now(),
): number {
  const playing = active?.nowPlaying;
  if (!(base && base.id === active?.id)) {
    return playing?.positionMs ?? 0;
  }
  const elapsed = base.playing ? Math.max(0, now - base.at) : 0;
  const position = base.positionMs + elapsed;
  return playing?.durationMs ? Math.min(position, playing.durationMs) : position;
}

export type { PositionBase };
export { baseOf, livePosition, seekedBase };
