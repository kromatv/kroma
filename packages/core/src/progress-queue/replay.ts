import type { ProgressEntry } from '@kromatv/client/media';
import type { PendingProgress } from './pending';

export const CLOCK_SKEW_MS = 60_000;

/**
 * Whether a queued position is still the truth, given what the server holds for
 * that item now.
 *
 * Nothing on the server is sent. A playback that ran to the end of the file is
 * sent whatever else happened, because finishing a title is the one statement a
 * later position elsewhere does not undo. Otherwise a server stamp newer than
 * the moment this position was captured, by more than [`CLOCK_SKEW_MS`], means
 * another device moved the title while this one was away: the queued position
 * is dropped rather than rewinding the account.
 */
export function shouldReplay(entry: PendingProgress, onServer: ProgressEntry | null): boolean {
  if (!onServer) return true;
  if (entry.reachedEnd) return true;
  const serverAt = Date.parse(onServer.updatedAt);
  if (Number.isNaN(serverAt)) return true;
  return serverAt <= entry.capturedAt + CLOCK_SKEW_MS;
}

const FIRST_RETRY_MS = 5_000;
const LONGEST_RETRY_MS = 300_000;

/** How long to wait before a replay pass that has failed `attempts` times is
 *  worth trying again: doubling from 5 s, never past 5 min. */
export function replayBackoffMs(attempts: number): number {
  const doublings = Math.max(0, Math.floor(attempts) - 1);
  return Math.min(FIRST_RETRY_MS * 2 ** doublings, LONGEST_RETRY_MS);
}
