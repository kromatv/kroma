import { StyleSheet } from 'react-native';
import { isStaticStyle } from '#ui/core/atomic/static-style';
import type { AnyStyle } from '#ui/core/types';

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
 *
 * A value the build compiled is registered already and comes back untouched.
 */
export function stabilise(merged: Record<string, unknown>): Record<string, unknown> {
  if (isStaticStyle(merged)) return merged;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(merged).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  for (const key of keys) out[key] = merged[key];
  return Object.freeze(StyleSheet.create({ s: out as AnyStyle }).s) as Record<string, unknown>;
}
