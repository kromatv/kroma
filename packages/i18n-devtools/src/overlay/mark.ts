import type { Rendered, Vars } from '../engine/engine';
import { type Origin, originOf } from './origin';

/** How the overlay grades a string: its own catalog answered, the fallback
 *  locale's did, a variable it names was never given a value, nothing answered,
 *  or it never went through a catalog at all. */
export type Grade = 'catalog' | 'fallback' | 'vars' | 'missing' | 'raw';

/** What answered one string on the page, and what it was rendered with. */
export interface Sighting {
  readonly key: string;
  readonly scope: string | null;
  readonly locale: string | null;
  readonly grade: Grade;
  readonly vars: Vars | undefined;
  /** The `{name}` placeholders the message kept, having been given no value. */
  readonly holes: readonly string[];
  /** Where the message is drawn from. */
  readonly origin: Origin | null;
}

const MARKS: Record<Exclude<Grade, 'raw'>, string> = {
  catalog: '\u2062',
  fallback: '\u2063',
  vars: '\u2064',
  missing: '\u2061',
};

const FIRST = 0x2061;
const LAST = 0x2064;
const OF_CODE: Record<number, Grade> = {
  8289: 'missing',
  8290: 'catalog',
  8291: 'fallback',
  8292: 'vars',
};

/** Worst first: what a reader should be sent to fix, in that order. */
const SEVERITY: Record<Grade, number> = { missing: 0, vars: 1, raw: 2, fallback: 3, catalog: 4 };

const remembered = new Map<string, Sighting>();

/** What answered a message: the grade a mark would carry. */
export function gradeOf({ from, locale, holes }: Rendered): Exclude<Grade, 'raw'> {
  if (!from) return 'missing';
  if (holes.length > 0) return 'vars';
  return from.locale === locale ? 'catalog' : 'fallback';
}

/**
 * Stamp what is about to be drawn with a zero-width mark naming what answered
 * it, and remember the message behind it.
 *
 * The mark is the only thing that can split a text node holding several
 * messages, which is why every string is stamped rather than looked up whole;
 * the memory beside it is what the hover card reads the key and the variables
 * from. While this is installed `t()` no longer returns the app's string: the
 * mark rides into every `aria-label`, `title`, input value and `===` the app
 * writes, which is why nothing but a dev switch installs it.
 */
export function mark(rendered: Rendered, drawn: string): string {
  const grade = gradeOf(rendered);
  const marked = MARKS[grade] + drawn;
  const seen = remembered.get(marked);
  if (seen?.key === rendered.key) return marked;
  remembered.set(marked, {
    key: rendered.key,
    scope: rendered.from?.scope ?? null,
    locale: rendered.from?.locale ?? null,
    grade,
    vars: rendered.vars,
    holes: rendered.holes,
    origin: originOf(rendered.key),
  });
  return marked;
}

/** Forget every message: nothing can read them once the overlay is down, and
 *  the page draws a new string for every value it interpolates. */
export function forgetMarks(): void {
  remembered.clear();
}

/**
 * What drew the string `text`, where it was one of ours.
 *
 * A message is stamped whole, but the page need not draw it whole: a component
 * that emphasises half a heading splits it across text nodes, and the mark
 * rides on the first of them. So a node that is the start of something
 * remembered is that thing, which is what the fall-through looks for.
 */
export function sightingIn(text: string): Sighting | null {
  const whole = remembered.get(text) ?? remembered.get(text.trim());
  if (whole) return whole;
  const start = text.trim();
  if (!start) return null;
  for (const [marked, sighting] of remembered) {
    if (marked.startsWith(start)) return sighting;
  }
  return null;
}

/** The worst grade marked in `text`, or `null` where nothing is: a string with
 *  no mark never came from a catalog. A scan rather than a match: this runs for
 *  every text node on the page, every frame the page changes. */
export function markIn(text: string): Grade | null {
  let worst: Grade | null = null;
  for (let at = 0; at < text.length; at += 1) {
    const code = text.codePointAt(at);
    if (code === undefined || code < FIRST || code > LAST) continue;
    const grade = OF_CODE[code] as Grade;
    if (grade === 'missing') return grade;
    if (worst === null || SEVERITY[grade] < SEVERITY[worst]) worst = grade;
  }
  return worst;
}

/** `text` without the marks, as a reader sees it. */
export function stripMarks(text: string): string {
  return text.replace(/[\u2061-\u2064]/g, '');
}
