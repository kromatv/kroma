// Sort and genre-filter helpers for the catalogue screens, working over the wire
// types already held in memory so browsing needs no extra request.

import type { Metadata } from '@kroma/client';

/** The minimal shape every browse helper reads; `MediaItem`, `Show` and the web
 * view-models all satisfy it. */
export interface Sortable {
  title: string;
  year: number | null;
  addedAt: string;
  metadata?:
    | (Pick<Metadata, 'rating' | 'releaseDate' | 'genres'> & { backdropUrl?: string | null })
    | null;
}

export type SortMode = 'added' | 'release' | 'title' | 'rating';

/** In picker order. */
export const SORT_MODES: readonly SortMode[] = ['added', 'release', 'title', 'rating'];

export function isSortMode(v: unknown): v is SortMode {
  return typeof v === 'string' && (SORT_MODES as readonly string[]).includes(v);
}

function cmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function releaseValue(item: Sortable): number | null {
  const iso = item.metadata?.releaseDate;
  if (iso) {
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) return ms;
  }
  if (item.year != null) return Date.UTC(item.year, 0, 1);
  return null;
}

// Every comparator falls through to a deterministic tiebreak: legacy webOS
// (Chromium 53) predates guaranteed stable sort. Missing values sort last.
const byTitle = (a: Sortable, b: Sortable): number => a.title.localeCompare(b.title);

function byRelease(a: Sortable, b: Sortable): number {
  const av = releaseValue(a);
  const bv = releaseValue(b);
  if (av == null && bv == null) return byTitle(a, b);
  if (av == null) return 1;
  if (bv == null) return -1;
  return bv - av || byTitle(a, b);
}

function byRating(a: Sortable, b: Sortable): number {
  const av = a.metadata?.rating ?? null;
  const bv = b.metadata?.rating ?? null;
  if (av == null && bv == null) return (b.year ?? 0) - (a.year ?? 0) || byTitle(a, b);
  if (av == null) return 1;
  if (bv == null) return -1;
  return bv - av || (b.year ?? 0) - (a.year ?? 0) || byTitle(a, b);
}

const COMPARATORS: Record<SortMode, (a: Sortable, b: Sortable) => number> = {
  added: (a, b) => cmp(b.addedAt, a.addedAt) || byTitle(a, b),
  release: byRelease,
  title: (a, b) => byTitle(a, b) || cmp(b.addedAt, a.addedAt),
  rating: byRating,
};

export function compareTitles(mode: SortMode): (a: Sortable, b: Sortable) => number {
  return COMPARATORS[mode];
}

/** Returns a new array; never mutates the input. */
export function sortTitles<T extends Sortable>(items: readonly T[], mode: SortMode): T[] {
  return [...items].sort(COMPARATORS[mode]);
}

export interface GenreCount {
  name: string;
  count: number;
}

/** Most common first, ties broken alphabetically. */
export function collectGenres(items: readonly Sortable[]): GenreCount[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const raw of it.metadata?.genres ?? []) {
      const name = raw.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Trim-tolerant exact match. */
export function hasGenre(item: Sortable, genre: string): boolean {
  const want = genre.trim();
  return (item.metadata?.genres ?? []).some((g) => g.trim() === want);
}
