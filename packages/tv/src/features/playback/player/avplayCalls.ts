import type { AvplayApi } from '#tv/features/playback/player/engine';

/** Tizen answers a call made in the wrong state (IDLE, mid-prepare) by throwing
 * rather than by returning. */
export function bestEffort(call: () => void): void {
  try {
    call();
  } catch {}
}

/** Free the singleton hardware resource: stop THEN close, or the next open fails. */
export function releasePlayer(api: AvplayApi): void {
  bestEffort(() => api.stop());
  bestEffort(() => api.close());
}

/** Suppress AVPlay's own subtitle rendering (the player draws its own). */
export function silenceSubtitles(api: AvplayApi): void {
  bestEffort(() => api.setSilentSubtitle(true));
}

/** The player's own clock in seconds, 0 where it will not say. */
export function currentSec(api: AvplayApi): number {
  try {
    return api.getCurrentTime() / 1000;
  } catch {
    return 0;
  }
}
