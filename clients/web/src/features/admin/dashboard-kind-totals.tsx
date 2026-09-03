import type { WatchKind, WatchTotals } from '@kroma/client/admin';
import { WATCH_KINDS } from '#web/features/admin/dashboard-filters';

/** Milliseconds watched per kind, zeroes included. `byKind` is what a server
 *  that breaks its aggregate down sends; `films` and `tv` are what one built
 *  before it did still answers with. */
export function kindTotals(
  byKind: WatchTotals | null | undefined,
  films: number,
  tv: number,
): Record<WatchKind, number> {
  return {
    movie: byKind?.movie ?? films,
    tv: byKind?.tv ?? tv,
  };
}

export function dominantKind(totals: Record<WatchKind, number>): WatchKind | null {
  let best: WatchKind | null = null;
  for (const kind of WATCH_KINDS) {
    if (totals[kind] > 0 && (best === null || totals[kind] > totals[best])) best = kind;
  }
  return best;
}
