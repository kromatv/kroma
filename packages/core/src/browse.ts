// Sort and genre-filter helpers for the catalogue screens, working over the wire
// types already held in memory so browsing needs no extra request.

import type { Metadata } from '@kroma/client';

import { genreEntries, genreSlug, genreSlugs } from './genre';

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
  slug: string;
  name: string;
  count: number;
}

/** One row per genre, not per spelling: a library holding both `Family` and
 * `Familial` counts them once. `name` is the first spelling seen, which only a
 * genre with no copy of its own ever shows. Most common first, ties broken
 * alphabetically. */
export function collectGenres(items: readonly Sortable[]): GenreCount[] {
  const counts = new Map<string, GenreCount>();
  for (const it of items) {
    for (const { slug, name } of genreEntries(it.metadata)) {
      const seen = counts.get(slug);
      if (seen) seen.count += 1;
      else counts.set(slug, { slug, name: name.trim() || slug, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/** Matches a display name in either language or a URL slug against the item's
 * own spellings, so `/genre/family` finds a title stored as `Familial`. */
export function hasGenre(item: Sortable, genre: string): boolean {
  const want = genreSlug(genre);
  if (!want) return false;
  return genreSlugs(item.metadata).includes(want);
}

/** Every fast-scroll bucket, in rail order: digits and symbols first, matching
 * where `localeCompare` files them. */
export const TITLE_LETTERS: readonly string[] = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

// The combining-marks range, not `\p{M}`: this module ships to the legacy
// webOS tier, whose engine cannot parse unicode property escapes.
const foldChar = (ch: string): string =>
  ch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

/** The fast-scroll bucket a title files under: its first letter or digit,
 * uppercased with diacritics folded ('É' → 'E'). Digit-led and symbol-only
 * titles bucket under '#', mirroring how `localeCompare` orders them. */
export function titleLetter(title: string): string {
  for (const ch of title) {
    const c = foldChar(ch).charAt(0);
    if (c >= 'A' && c <= 'Z') return c;
    if (c >= '0' && c <= '9') return '#';
  }
  return '#';
}

export interface LetterMark {
  letter: string;
  index: number;
}

/** The first index of each bucket present in a title-sorted list, in list
 * order, so a fast-scroll rail can jump straight to `items[mark.index]`. */
export function letterMarks(items: readonly Sortable[]): LetterMark[] {
  const marks: LetterMark[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const letter = titleLetter(item.title);
    if (seen.has(letter)) return;
    seen.add(letter);
    marks.push({ letter, index });
  });
  return marks;
}
