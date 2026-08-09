// The "Manquants" page's client-side shape: entries off the wire grouped under
// their title, and the row key the selection / busy / done sets share.

import type { CalendarEntry } from '@kroma/core';

export interface MissingGroup {
  requestId: string | null;
  tmdbId: number;
  kind: CalendarEntry['kind'];
  title: string;
  year: number | null;
  posterUrl: string | null;
  items: CalendarEntry[];
}

/** A stable key for one missing row (unique across the whole list). */
export function epKey(e: CalendarEntry): string {
  const groupKey = e.requestId ?? `tmdb:${e.tmdbId}`;
  return `${groupKey}:${e.season ?? 0}:${e.episode ?? 0}`;
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
