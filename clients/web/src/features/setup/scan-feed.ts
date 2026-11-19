/** One title as the scan feed reads it: where its poster is, once matched. */
export interface ScannedTitle {
  id: string;
  poster: string;
  matched: boolean;
}

export type ScanPhase = 'reading' | 'matching' | 'ready';

export interface ScanCounts {
  found: number;
  matched: number;
  phase: ScanPhase;
}

/** A scan as the owner watches it: its counts, and the posters of the matched
 * titles, the newest first. */
export interface ScanFeed extends ScanCounts {
  posters: string[];
}

/** What the titles in hand say about a scan. `walking` is whether the server
 * announced a walk that has not ended. */
export function scanCounts(
  titles: readonly ScannedTitle[],
  { walking }: { walking: boolean },
): ScanCounts {
  const found = titles.length;
  const matched = titles.filter((title) => title.matched).length;
  if (walking || found === 0) {
    return { found, matched, phase: 'reading' };
  }
  return { found, matched, phase: matched < found ? 'matching' : 'ready' };
}

/** The posters in the order they arrived, the newest first. A poster already
 * in `seen` keeps its place, and one that left the library leaves the list. */
export function arrivals(seen: readonly string[], titles: readonly ScannedTitle[]): string[] {
  const held = new Set(titles.filter((title) => title.matched).map((title) => title.poster));
  const kept = seen.filter((poster) => held.has(poster));
  const known = new Set(kept);
  const fresh = [...held].filter((poster) => !known.has(poster));
  return [...fresh, ...kept];
}

/** A wall of `size` posters where the library's own take the first slots, in
 * the order they arrived, and every other slot keeps the poster `fill` gave
 * it. A new arrival therefore changes one slot and moves nothing else. */
export function ownFirst(
  newestFirst: readonly string[],
  fill: readonly string[],
  size: number,
): string[] {
  const own = [...newestFirst].reverse();
  return Array.from(
    { length: size },
    (_, slot) => own[slot] ?? fill[slot % Math.max(fill.length, 1)],
  ).filter((poster): poster is string => poster !== undefined);
}
