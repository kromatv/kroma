// What a palette shows for a query, and where each row sits inside the
// scroller.
//
// The geometry is arithmetic rather than a measurement pass: every row and
// every heading is pinned to a height, so keeping the cursor on screen is a
// sum over the sections above it and never a layout round-trip. That is also
// what lets the whole of this be tested without a renderer.

import type { IconName } from '#ui/components/atoms/icon';
import { fuzzyScore } from '#ui/lib/fuzzy-search';

/** One row of a command palette. */
interface CommandItem {
  id: string;
  label: string;
  /** The section it is listed under. Items are grouped in the order they are
   *  given, so a caller sorts once and the palette follows. */
  group?: string;
  icon?: IconName;
  /** Searched as well as the label: a summary, a path, a list of synonyms. */
  keywords?: string;
  /** Reported at the end of the row, after the label. */
  meta?: string;
}

/** A run of items under one heading. An empty title is a run with no heading. */
interface CommandSection {
  title: string;
  items: readonly CommandItem[];
}

/** The heights the palette is drawn at, and the ones `offsetOf` sums. */
const METRICS = {
  row: 36,
  heading: 26,
  pad: 6,
  separator: 1,
  /** How tall the list may get before it scrolls. */
  maxHeight: 320,
} as const;

/** How well an item answers a query, or nothing when it does not. Ranked
 * subsequence matching rather than a substring test, because that is what a
 * reader typing three letters into a palette expects - and the kit already has
 * the matcher (`lib/fuzzy-search`, built for the icon browser). */
function rank(item: CommandItem, query: string): Ranked | null {
  const onLabel = fuzzyScore(item.label, query);
  const elsewhere = [item.group, item.keywords, item.meta]
    .map((field) => (field ? fuzzyScore(field, query) : null))
    .reduce<number | null>(
      (best, score) => (score === null ? best : Math.max(best ?? score, score)),
      null,
    );
  if (onLabel !== null) return { item, onLabel: true, score: onLabel };
  return elsewhere === null ? null : { item, onLabel: false, score: elsewhere };
}

interface Ranked {
  item: CommandItem;
  /** A match on what the row SAYS outranks one on what it is filed under,
   *  whatever the two score. */
  onLabel: boolean;
  score: number;
}

/** Whether a query reaches an item at all. */
function matches(item: CommandItem, query: string): boolean {
  return rank(item, query) !== null;
}

/** The sections a query leaves. With nothing typed they are the order the items
 * were given; with a query they are best first, and a section follows the best
 * row inside it. */
function sectionsOf(items: readonly CommandItem[], query: string): CommandSection[] {
  const hits = items.map((item) => rank(item, query)).filter((hit) => hit !== null);
  if (query.trim()) {
    hits.sort((a, b) => Number(b.onLabel) - Number(a.onLabel) || b.score - a.score);
  }
  const out: CommandSection[] = [];
  const at = new Map<string, CommandItem[]>();
  for (const { item } of hits) {
    const title = item.group ?? '';
    const bucket = at.get(title);
    if (bucket) {
      bucket.push(item);
      continue;
    }
    const started: CommandItem[] = [item];
    at.set(title, started);
    out.push({ title, items: started });
  }
  return out;
}

/** Every visible row, in cursor order. */
function flatten(sections: readonly CommandSection[]): CommandItem[] {
  return sections.flatMap((section) => [...section.items]);
}

/** Where the nth result starts inside the scroller. */
function offsetOf(sections: readonly CommandSection[], index: number): number {
  let y = METRICS.pad;
  let seen = 0;
  for (const section of sections) {
    if (section.title) y += METRICS.heading;
    if (index < seen + section.items.length) return y + (index - seen) * METRICS.row;
    y += section.items.length * METRICS.row;
    seen += section.items.length;
    // The hairline drawn between sections: unaccounted, it accumulates and the
    // in-view test goes wrong at the last section's boundary.
    y += METRICS.separator;
  }
  return y;
}

/** Where the scroller has to move to bring row `index` into view, or null when
 * it is already there. Moves as little as possible: recentring on every arrow
 * press flickers the whole list past the row being read. */
function scrollTo(
  sections: readonly CommandSection[],
  index: number,
  offset: number,
  viewport: number,
): number | null {
  const y = offsetOf(sections, index);
  if (y >= offset && y + METRICS.row <= offset + viewport) return null;
  const next = y < offset ? y - METRICS.pad : y + METRICS.row - viewport + METRICS.pad;
  return Math.max(0, next);
}

/** The cursor `delta` rows on, wrapping at both ends. */
function stepTo(from: number, delta: number, length: number): number {
  if (length === 0) return 0;
  const at = Math.min(Math.max(0, from), length - 1);
  // The extra turn keeps a backwards step non-negative before the modulo,
  // whatever a page step is worth.
  return (at + delta + length * Math.max(1, Math.abs(delta))) % length;
}

export type { CommandItem, CommandSection };
export { flatten, METRICS, matches, offsetOf, scrollTo, sectionsOf, stepTo };
