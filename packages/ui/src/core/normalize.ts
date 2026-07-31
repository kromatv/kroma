// Authored declaration -> the canonical form the resolver merges. Runs once per
// declaration at module load, never per render.

import { COLOR_KEYS, color } from '#ui/core/color';
import { type BoxStyleProps, boxStyle, splitShorthand, textStyle } from '#ui/core/shorthands';
import { STATE_KEYS, type SvStateName } from '#ui/core/states';

export interface Split {
  rest: Record<string, unknown>;
  states: Partial<Record<SvStateName, Record<string, unknown>>>;
  declared: SvStateName[];
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
    states[name] = normalize(decl[key] as Record<string, unknown>);
    declared.push(name);
  }
  return { rest: normalize(authored), states, declared };
}

/**
 * Rewrites one layer into React Native longhands, resolving shorthands and
 * colours.
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
 * Freezes a merged value with its keys in a canonical order: React Native's own
 * shorthands first, then everything else alphabetically.
 *
 * react-native-web compiles a style object into atomic CSS, so an order that
 * varied with which layers contributed would mean an unstable stylesheet between
 * builds. Sorting alone is not enough — see `RN_SHORTHANDS`.
 */
export function stabilise(merged: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(merged).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  for (const key of keys) out[key] = merged[key];
  return Object.freeze(out);
}
