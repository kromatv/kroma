import { tokensIn } from '@kromatv/i18n';
import { type Part, partsOf } from '#site/lib/placeables';

/** How a run of a translation is marked in its field: plain, a placeholder the source has, a reference, or a placeholder the source does not pass. */
export type MarkTone = 'plain' | 'placeholder' | 'ref' | 'unknown';

/** One run of a translation as its field marks it, starting at `at`. */
export interface Mark {
  text: string;
  tone: MarkTone;
  at: number;
}

function toneOf(part: Part, passed: (name: string) => boolean): MarkTone {
  if (part.kind === 'text') {
    return 'plain';
  }
  if (part.kind === 'ref') {
    return 'ref';
  }
  return passed(part.name) ? 'placeholder' : 'unknown';
}

/**
 * `value` cut into the runs its field marks, read as the server checks it
 * against `source`; a `plural` form may name `{count}` its source lacks. A
 * trailing line break gets a space after it, so a mirror of the field is as
 * tall as the field.
 */
export function fieldMarks(value: string, source: string, { plural }: { plural: boolean }): Mark[] {
  const known = new Set(tokensIn(source));
  const passed = (name: string) => known.has(name) || (plural && name === 'count');
  const marks = partsOf(value).map((part) => ({
    text: part.value,
    tone: toneOf(part, passed),
    at: part.at,
  }));
  return value.endsWith('\n') ? [...marks, { text: ' ', tone: 'plain', at: value.length }] : marks;
}
