import type { WatchableProbe, WatchableSubtitle } from '@kromatv/client/watchable';
import type { Cue } from './subtitles';

export const SUBTITLE_REFETCH_MS = 20_000;

const SOUGHT_SEC = 3;

export function watchSubtitleTracks(probe: Pick<WatchableProbe, 'subtitles'>): WatchableSubtitle[] {
  return probe.subtitles.filter((track) => track.text);
}

const cueKey = (cue: Cue): string => `${cue.start}|${cue.end}|${cue.text}`;

/** The cues to draw once a fetch answers. A partial answer may miss a cue already
 * drawn, so every held cue stays, a cue found twice is kept once, and the whole
 * is in time order. A complete answer replaces them. */
export function heldCues(
  held: readonly Cue[],
  fetched: readonly Cue[],
  partial: boolean,
): readonly Cue[] {
  if (!partial) return fetched;
  const seen = new Set<string>();
  const merged: Cue[] = [];
  for (const cue of [...held, ...fetched]) {
    const key = cueKey(cue);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cue);
  }
  return merged.sort((a, b) => a.start - b.start);
}

export interface SeekState {
  atSec: number;
  seeking: boolean;
}

/** Reads the player's clock once more. A clock that jumped was sought, and the
 * seek lands on the first reading where the player is no longer waiting on it:
 * `landed` is true on that reading alone. */
export function seekLanded(
  last: SeekState | null,
  clock: Readonly<{ atSec: number; waiting: boolean }>,
): { state: SeekState; landed: boolean } {
  const jumped = last !== null && Math.abs(clock.atSec - last.atSec) > SOUGHT_SEC;
  const seeking = (last?.seeking ?? false) || jumped;
  return {
    state: { atSec: clock.atSec, seeking: seeking && clock.waiting },
    landed: seeking && !clock.waiting,
  };
}
