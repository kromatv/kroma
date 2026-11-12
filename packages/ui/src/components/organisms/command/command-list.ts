// What a palette shows for a query, and where each row sits inside the
// scroller.
//
// The geometry is arithmetic rather than a measurement pass: every row and
// every heading is pinned to a height, so keeping the cursor on screen is a
// sum over the sections above it and never a layout round-trip. That is also
// what lets the whole of this be tested without a renderer.

import type { IconName } from '#ui/components/atoms/icon';
import { matchText, queryTerms } from '#ui/lib/text-match';

/** Something a row can do, listed in its action panel. */
interface CommandAction {
  id: string;
  label: string;
  icon?: IconName;
  /** Drawn in the danger colour, apart from the others at the end of the panel. */
  danger?: boolean;
}

/** One row of a command palette. */
interface CommandItem {
  id: string;
  label: string;
  /** The section it is listed under. Items are grouped in the order they are
   *  given, so a caller sorts once and the palette follows. */
  group?: string;
  icon?: IconName;
  /** A second line under the label, shown and searched: what kind of thing this
   *  is, and which one. */
  subtitle?: string;
  /** Artwork drawn in place of the icon, which stays as what shows if it fails to load. */
  image?: string;
  /** The shape of `image`: a `poster`, as wide as an icon's well and taller, by default,
   *  which draws the row taller, or a `tile`, which fills the well itself. */
  imageShape?: 'poster' | 'tile';
  /** Searched as well as the label: a summary, a path, a list of synonyms. */
  keywords?: string;
  /** Reported at the end of the row, after the label. */
  meta?: string;
  /** A state drawn as a badge at the very end of the row. `tone` defaults to `neutral`. */
  status?: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' };
  /** Listed whatever is typed: on what its label scores, otherwise below every
   *  row that matched. For a row something else already matched, or a way out. */
  always?: boolean;
  /** What it can do, likeliest first: Enter runs the first, Command or Ctrl with
   *  Enter runs the second, and Command or Ctrl with K lists them all. */
  actions?: readonly CommandAction[];
}

/** A run of items under one heading. An empty title is a run with no heading. */
interface CommandSection {
  title: string;
  items: readonly CommandItem[];
}

/** The heights the palette is drawn at, and the ones `offsetOf` sums. */
const METRICS = {
  row: 44,
  /** A row with a poster. */
  tallRow: 59,
  heading: 28,
  pad: 8,
  /** The air between two sections. */
  sectionGap: 10,
  /** How tall the list is, whatever it holds, so nothing moves while typing. */
  maxHeight: 368,
} as const;

/** The heights the action panel is drawn at. */
const ACTION_METRICS = {
  row: 36,
  rule: 9,
  pad: 6,
  maxHeight: 280,
  chrome: 28,
} as const;

/** Whether an item is drawn at {@link METRICS.tallRow}. */
function isTall(item: CommandItem): boolean {
  return Boolean(item.image && item.imageShape !== 'tile');
}

const heightOf = (item: CommandItem | undefined): number =>
  item && isTall(item) ? METRICS.tallRow : METRICS.row;

const FLOOR = Number.MIN_SAFE_INTEGER;
const ACROSS_FIELDS = 0.8;

/** What a caller adds to a row's score for a query, such as what the viewer chose before. */
type CommandBoost = (item: CommandItem, query: string) => number;

const ELSEWHERE: readonly (readonly [keyof CommandItem, number])[] = [
  ['subtitle', 0.7],
  ['keywords', 0.6],
  ['meta', 0.4],
  ['group', 0.3],
];

function fieldScore(item: CommandItem, field: keyof CommandItem, query: string): number | null {
  const text = item[field];
  if (typeof text !== 'string' || !text) return null;
  const hit = matchText(text, query, { strict: true });
  return hit && hit.score;
}

function bestScore(item: CommandItem, query: string): number | null {
  let best = matchText(item.label, query)?.score ?? null;
  for (const [field, weight] of ELSEWHERE) {
    const score = fieldScore(item, field, query);
    if (score !== null) best = Math.max(best ?? 0, score * weight);
  }
  return best;
}

function scoreAcross(item: CommandItem, query: string): number | null {
  const terms = queryTerms(query);
  if (terms.length < 2) return null;
  let total = 0;
  for (const term of terms) {
    const score = bestScore(item, term);
    if (score === null) return null;
    total += score;
  }
  return (total / terms.length) * ACROSS_FIELDS;
}

function rank(item: CommandItem, query: string, boost: CommandBoost | undefined): Ranked | null {
  const score = item.always
    ? (matchText(item.label, query)?.score ?? null)
    : (bestScore(item, query) ?? scoreAcross(item, query));
  if (score === null) return item.always ? { item, score: FLOOR } : null;
  return { item, score: score + (boost?.(item, query) ?? 0) };
}

interface Ranked {
  item: CommandItem;
  score: number;
}

function ranked(items: readonly CommandItem[], query: string, boost?: CommandBoost) {
  return items
    .map((item) => rank(item, query, boost))
    .filter((hit) => hit !== null)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/** What a palette lists. With nothing typed, the items under their headings, in the order
 * they were given. With a query, one run with no heading, best first with what `boost` adds
 * counted in, since a heading would hold a row above a better one. */
function sectionsOf(
  items: readonly CommandItem[],
  query: string,
  boost?: CommandBoost,
): CommandSection[] {
  if (query.trim()) {
    const hits = ranked(items, query, boost);
    return hits.length > 0 ? [{ title: '', items: hits }] : [];
  }
  const out: CommandSection[] = [];
  const at = new Map<string, CommandItem[]>();
  for (const item of items) {
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

/** The actions a panel's field leaves, in the order given. */
function matchingActions(
  actions: readonly CommandAction[],
  query: string,
): readonly CommandAction[] {
  return query.trim()
    ? actions.filter((action) => matchText(action.label, query) !== null)
    : actions;
}

/** Where the nth result starts inside the scroller. */
function offsetOf(sections: readonly CommandSection[], index: number): number {
  let y = METRICS.pad;
  let seen = 0;
  for (const section of sections) {
    if (section.title) y += METRICS.heading;
    for (const item of section.items) {
      if (seen === index) return y;
      y += heightOf(item);
      seen += 1;
    }
    y += METRICS.sectionGap;
  }
  return y;
}

function revealed(
  { y, height, pad }: { y: number; height: number; pad: number },
  offset: number,
  viewport: number,
): number | null {
  if (y >= offset && y + height <= offset + viewport) return null;
  return Math.max(0, y < offset ? y - pad : y + height - viewport + pad);
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
  const row = {
    y: offsetOf(sections, index),
    height: heightOf(flatten(sections)[index]),
    pad: METRICS.pad,
  };
  return revealed(row, offset, viewport);
}

/** Whether the rule that sets the dangerous actions apart sits above action `index`. */
function opensDanger(actions: readonly CommandAction[], index: number): boolean {
  return index > 0 && Boolean(actions[index]?.danger) && !actions[index - 1]?.danger;
}

/** Where the nth action starts inside the panel's scroller. */
function actionOffsetOf(actions: readonly CommandAction[], index: number): number {
  let y = ACTION_METRICS.pad;
  for (let at = 0; at <= index; at += 1) {
    if (opensDanger(actions, at)) y += ACTION_METRICS.rule;
    if (at < index) y += ACTION_METRICS.row;
  }
  return y;
}

/** {@link scrollTo} for the action panel. */
function scrollActionsTo(
  actions: readonly CommandAction[],
  index: number,
  offset: number,
  viewport: number,
): number | null {
  if (index < 0) return null;
  const row = {
    y: actionOffsetOf(actions, index),
    height: ACTION_METRICS.row,
    pad: ACTION_METRICS.pad,
  };
  return revealed(row, offset, viewport);
}

/** The cursor `delta` rows on, wrapping at both ends. */
function stepTo(from: number, delta: number, length: number): number {
  if (length === 0) return 0;
  const at = Math.min(Math.max(0, from), length - 1);
  // The extra turn keeps a backwards step non-negative before the modulo,
  // whatever a page step is worth.
  return (at + delta + length * Math.max(1, Math.abs(delta))) % length;
}

export type { CommandAction, CommandBoost, CommandItem, CommandSection };
export {
  ACTION_METRICS,
  actionOffsetOf,
  flatten,
  isTall,
  METRICS,
  matchingActions,
  offsetOf,
  opensDanger,
  scrollActionsTo,
  scrollTo,
  sectionsOf,
  stepTo,
};
