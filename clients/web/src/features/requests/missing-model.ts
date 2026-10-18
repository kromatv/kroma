import type { CalendarEntry, EpisodeRef, RequestId } from '@kromatv/client/requests';

export type MissingOrigin = 'gap' | 'monitored' | 'request';

export interface MissingGroup {
  requestId: RequestId | null;
  origin: MissingOrigin;
  tmdbId: number;
  kind: CalendarEntry['kind'];
  title: string;
  year: number | null;
  posterUrl: string | null;
  items: CalendarEntry[];
}

/** `GET /api/requests/missing` merges three sources into one list: a library
 * gap arrives as `missing`, and a `wanted` row with no request behind it is one
 * monitoring holds. */
export function entryOrigin(entry: CalendarEntry): MissingOrigin {
  if (entry.requestId !== null) return 'request';
  return entry.status === 'missing' ? 'gap' : 'monitored';
}

export function isFollowed(group: MissingGroup): boolean {
  return group.origin !== 'gap';
}

/** A stable key for one missing row (unique across the whole list). */
export function epKey(e: CalendarEntry): string {
  const groupKey = e.requestId ?? `tmdb:${e.tmdbId}`;
  return `${groupKey}:${e.season ?? 0}:${e.episode ?? 0}`;
}

/** The episodes of `entries`, dropping a film (which has neither number). */
export function episodeRefs(entries: readonly CalendarEntry[]): EpisodeRef[] {
  const refs: EpisodeRef[] = [];
  for (const entry of entries) {
    if (entry.season !== null && entry.episode !== null) {
      refs.push({ season: entry.season, episode: entry.episode });
    }
  }
  return refs;
}

/** Groups entries by request, or by tmdb id for a library-scan gap with no
 * request yet, preserving the server's order. */
export function groupByTitle(entries: CalendarEntry[]): MissingGroup[] {
  const byKey = new Map<string, MissingGroup>();
  const order: string[] = [];
  for (const e of entries) {
    const key = e.requestId ?? `tmdb:${e.tmdbId}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        requestId: e.requestId,
        origin: entryOrigin(e),
        tmdbId: e.tmdbId,
        kind: e.kind,
        title: e.title,
        year: e.year,
        posterUrl: e.posterUrl,
        items: [],
      };
      byKey.set(key, g);
      order.push(key);
    }
    g.items.push(e);
  }
  return order.map((key) => byKey.get(key) as MissingGroup);
}

export function splitByFollowing(groups: readonly MissingGroup[]): {
  followed: MissingGroup[];
  unfollowed: MissingGroup[];
} {
  return {
    followed: groups.filter(isFollowed),
    unfollowed: groups.filter((group) => !isFollowed(group)),
  };
}

export function unitCount(groups: readonly MissingGroup[]): number {
  return groups.reduce((total, group) => total + group.items.length, 0);
}
