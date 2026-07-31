// The kit's colour vocabulary: what a colour may be written as, and how it
// resolves to something React Native can paint.

import { activeTheme } from '#ui/core/theme';
import type { ColorToken } from '#ui/core/tokens';
import { withAlpha } from '#ui/core/tokens/colors';

export { withAlpha };

const BARE = { white: '#FFFFFF', black: '#000000' } as const;

export type ColorBase = ColorToken | keyof typeof BARE;

/**
 * A colour. Deliberately not `ColorToken | (string & {})`: that escape hatch
 * made every string legal, so `bg: 'acent'` compiled and painted nothing, since
 * `color()` returns an unrecognised value verbatim and React Native ignores a
 * colour it cannot parse.
 */
export type ColorValue =
  | ColorBase
  | `${ColorBase}/${number}`
  | `#${string}`
  | `rgb(${string})`
  | `rgba(${string})`
  | `hsl(${string})`
  | `hsla(${string})`
  | 'transparent'
  | 'currentColor';

/** Resolves a token name through the palette and anything else verbatim. A
 *  trailing `/NN` is Tailwind's alpha syntax and means NN percent opacity. */
export function color(value: string): string {
  const slash = value.lastIndexOf('/');
  if (slash === -1) return named(value);
  const suffix = value.slice(slash + 1);
  const alpha = Number(suffix);
  const base = value.slice(0, slash);
  // An empty suffix is not an alpha: `Number('')` is 0, which would silently
  // make `white/` fully transparent. `rgb(255 0 0 / 50%)` is likewise a colour
  // that contains a slash rather than one carrying an alpha suffix.
  if (suffix === '' || !Number.isFinite(alpha) || /[\s(),]/.test(base)) return named(value);
  return withAlpha(named(base), alpha / 100);
}

function named(value: string): string {
  return (
    (BARE as Record<string, string>)[value] ??
    (activeTheme().colors as Record<string, string>)[value] ??
    value
  );
}

/** Style keys whose value is a colour. A recipe slot that feeds an <Icon> writes
 *  `color`, which is not a shorthand, and must still resolve `accent/45`. */
export const COLOR_KEYS: ReadonlySet<string> = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'shadowColor',
  'textDecorationColor',
  'textShadowColor',
  'tintColor',
  'overlayColor',
  'placeholderTextColor',
]);
