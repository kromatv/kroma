import type { AvplayLanding } from '#tv/features/playback/player/avplayLanding';
import { NATIVE_SEEK_AHEAD } from '#tv/features/playback/player/baseEngine';
import type { AvplayApi } from '#tv/features/playback/player/engine';

export function insideRunningMaster(
  absSec: number,
  anchorSec: number,
  playheadSec: number,
): boolean {
  return absSec >= anchorSec && absSec <= playheadSec + NATIVE_SEEK_AHEAD;
}

export function seekToAnchor(api: AvplayApi, landing: AvplayLanding): void {
  try {
    api.seekTo(
      0,
      () => landing.landed(),
      () => landing.refused(),
    );
  } catch {
    landing.refused();
  }
}

/** One open at a time: a filter toggle or a seek can arrive while the round-trip
 * that resolves an anchor is pending, so a stale resolution is dropped rather than
 * left to overwrite the anchor that replaced it. */
export class AvplayOpens {
  private stamp = 0;

  begin(): number {
    this.stamp += 1;
    return this.stamp;
  }

  abandoned(stamp: number): boolean {
    return stamp !== this.stamp;
  }
}
