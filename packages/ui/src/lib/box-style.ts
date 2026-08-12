// The <Box> prop-bag cache.
//
// The shorthand vocabulary itself lives in the engine (`#ui/core/shorthands`);
// what stays here is the one thing only <Box> needs - turning a per-instance
// prop bag into a style shared BY IDENTITY with every other box asking for the
// same thing.

import { StyleSheet, type ViewStyle } from 'react-native';
import { type BoxStyleProps, boxStyle } from '#ui/core/shorthands';
import { themedCache } from '#ui/core/theme';

const shared = themedCache<ViewStyle>(4096);

/**
 * The same style, by identity, for the same shorthand props.
 *
 * `boxStyle` is pure but returns a fresh object every call, and on the browser
 * targets that is the most expensive habit in the kit. styleq caches compiled
 * styles in a WeakMap keyed on each leaf style OBJECT, so a new object per
 * render per <Box> is a guaranteed miss for every box on the screen. Handing
 * back the same object makes it a hit, and going through `StyleSheet.create`
 * compiles it to atomic classes rather than re-walking the declarations.
 *
 * The engine's `sharedStyle` is the same thing for a declaration in the kit's
 * own vocabulary; this one takes <Box>'s prop bag.
 */
export function sharedBoxStyle(key: string, p: Readonly<BoxStyleProps>): ViewStyle {
  return shared(key, () => StyleSheet.create({ box: boxStyle(p) }).box as ViewStyle);
}
