// What an episode of the requested title is in, derived from TMDB's row, the
// request's ledger and the library. Pure so the page can say "missing" and mean
// it: the request covering an episode and the library holding it are different
// facts, and only one of them is what an admin came here to see.

import type { LedgerEpisode, LedgerSeason } from '@kroma/core';

/** Where one episode stands. `untracked` is on no shelf and in no request: the
 * request left it out, which is not the same as it being wanted. */
export type EpisodeState = 'onDisk' | 'queued' | 'unaired' | 'missing' | 'untracked';

export function episodeState(ep: LedgerEpisode, today: string): EpisodeState {
  if (ep.onDisk) return 'onDisk';
  if (ep.wantedStatus === 'grabbed') return 'queued';
  if (ep.airDate != null && ep.airDate > today) return 'unaired';
  return ep.wantedId == null ? 'untracked' : 'missing';
}

/** The season a freshly opened page should show: the first one the library is
 * short of, or the first season at all when the title is complete. */
export function seasonToOpen(seasons: readonly LedgerSeason[]): number | null {
  const short = seasons.find((s) => s.onDisk < s.episodeCount);
  return (short ?? seasons[0])?.season ?? null;
}

/** Whether the request covers any of this season. A season it left out is still
 * searchable, and saying so is the point of showing it at all. */
export function isRequested(season: LedgerSeason): boolean {
  return season.requested > 0;
}
