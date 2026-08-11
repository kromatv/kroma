// Authored declaration -> the canonical form the resolver merges. Runs once per
// declaration at module load, never per render.

import { StyleSheet } from 'react-native';
import { COLOR_KEYS, color } from '#ui/core/color';
import {
  type BoxStyleProps,
  boxStyle,
  declaredBreakpoints,
  splitShorthand,
  textStyle,
} from '#ui/core/shorthands';
import { STATE_KEYS, type SvStateName } from '#ui/core/states';
import type { AnyStyle } from '#ui/core/types';

export interface Split {
  rest: Record<string, unknown>;
  states: Partial<Record<SvStateName, Record<string, unknown>>>;
  declared: SvStateName[];
  breakpoints: number;
}

/**
 * Splits a declaration into its rest value and its per-state layers, normalising
 * each. Throws on an unknown `_`-prefixed key: TypeScript only guards those for
 * an inline literal, and a layer built from a variable would otherwise carry
 * `_active` into the output as a style key React Native silently ignores.
 */
export function split(decl: Record<string, unknown> | undefined): Split | undefined {
  if (!decl) return undefined;
  const authored: Record<string, unknown> = {};
  const states: Split['states'] = {};
  const declared: SvStateName[] = [];
  let breakpoints = 0;
  for (const key of Object.keys(decl)) {
    if (!key.startsWith('_')) {
      authored[key] = decl[key];
      continue;
    }
    if (!STATE_KEYS.has(key)) {
      throw new Error(
        `sv: unknown state "${key}". States are ${[...STATE_KEYS].join(', ')}; anything else a component can be in is a variant.`,
      );
    }
    const name = key.slice(1) as SvStateName;
    const layer = decl[key] as Record<string, unknown>;
    breakpoints |= declaredBreakpoints(layer);
    states[name] = normalize(layer);
    declared.push(name);
  }
  return {
    rest: normalize(authored),
    states,
    declared,
    breakpoints: breakpoints | declaredBreakpoints(authored),
  };
}

/**
 * Rewrites one layer into React Native longhands, resolving shorthands, colours
 * and, against the active breakpoint, any value stated per breakpoint.
 *
 * Per LAYER, which is what makes merging correct: merging authored keys would
 * leave `{ px: 18 }` and `{ p: 12 }` both alive, and the resolver would then
 * pick by specificity rather than by order, so an earlier base would beat a
 * later variant. Once every layer speaks longhand, `Object.assign` is the
 * conflict resolution - last write wins, per property, like CSS.
 */
export function normalize(decl: Record<string, unknown>): Record<string, unknown> {
  const { shorthand, rest, any } = splitShorthand(decl);
  // Text before colour: `text` may bring keys the loop below never touches, and
  // consuming `text`/`font` first keeps them out of the colour pass entirely.
  const type = textStyle(rest);
  for (const key of Object.keys(rest)) {
    const value = rest[key];
    if (COLOR_KEYS.has(key) && typeof value === 'string') rest[key] = color(value);
  }
  if (!any && !type) return rest;
  // Shorthands first, the role's bundle under them, so a longhand in the same
  // layer wins over both.
  return { ...type, ...boxStyle(shorthand as BoxStyleProps), ...rest };
}

// React Native resolves a shorthand against its own longhands by DECLARATION
// ORDER within one object, so `paddingVertical` must precede `paddingTop` or the
// less specific key wins. Sorting alphabetically would put it after.
const RN_SHORTHANDS: ReadonlySet<string> = new Set([
  'padding',
  'paddingVertical',
  'paddingHorizontal',
  'margin',
  'marginVertical',
  'marginHorizontal',
  'borderWidth',
  'borderColor',
  'borderRadius',
  'inset',
  'gap',
]);

const rank = (key: string) => (RN_SHORTHANDS.has(key) ? 0 : 1);

/**
 * Registers a merged value, with its keys in a canonical order: React Native's
 * own shorthands first, then everything else alphabetically.
 *
 * Registration is what makes react-native-web compile the declarations into
 * atomic classes rather than re-serialise them onto every element. It hands the
 * same object back, so the result is still a plain style a caller can read.
 *
 * An order that varied with which layers contributed would mean an unstable
 * stylesheet between builds. Sorting alone is not enough, see `RN_SHORTHANDS`.
 */
export function stabilise(merged: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(merged).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  for (const key of keys) out[key] = merged[key];
  return Object.freeze(StyleSheet.create({ s: out as AnyStyle }).s) as Record<string, unknown>;
}
