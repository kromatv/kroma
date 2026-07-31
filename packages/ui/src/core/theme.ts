// The theme: every token group behind one live store, and KROMA as the default.
//
// A theme is a plain object. `createTheme` deep-merges overrides over a base and
// re-derives the bundles that follow from other groups — the finished type roles
// from `typeSpec` + `fonts`, the focus ring from the accent — so overriding one
// side updates everything built on it. `setTheme` swaps the active theme and
// bumps a version; recipes, `styles()` and <Box> all check that version and
// re-resolve lazily on their next use, so a switch costs one rebuild per recipe
// actually rendered, not an eager sweep.
//
// Adding a token GROUP is adding a key to `ThemeTokens` and a base value below.
// Adding a NAME to a group is a registry augmentation (see `ColorRegistry`) plus
// the value in `createTheme` — the name is then typed everywhere the vocabulary
// reaches.

import type { TextStyle } from 'react-native';
import { type ColorToken, colors, withAlpha } from './tokens/colors';
import { motion, type ShadowToken, shadow } from './tokens/effects';
import { gutter, type RadiusToken, radius, rhythm, space } from './tokens/layout';
import {
  type FontToken,
  fonts,
  type TypeRole,
  type TypeSpec,
  toType,
  tracking,
  typeSpec,
} from './tokens/typography';

/** The token modules author values `as const`; a theme's slots take any value
 *  of the same shape, not only the KROMA literal. */
type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : { [K in keyof T]: Widen<T[K]> };

export interface ThemeTokens {
  colors: Record<ColorToken, string>;
  radius: Record<RadiusToken, number>;
  shadow: Record<ShadowToken, string>;
  fonts: Record<FontToken, string>;
  typeSpec: Record<TypeRole, TypeSpec>;
  motion: Widen<typeof motion>;
  gutter: Widen<typeof gutter>;
  space: Widen<typeof space>;
  rhythm: Widen<typeof rhythm>;
  tracking: Widen<typeof tracking>;
}

const GROUPS: readonly (keyof ThemeTokens)[] = [
  'colors',
  'radius',
  'shadow',
  'fonts',
  'typeSpec',
  'motion',
  'gutter',
  'space',
  'rhythm',
  'tracking',
];

export interface Theme extends ThemeTokens {
  /** Derived from `typeSpec` + `fonts`; never authored directly. */
  type: Record<TypeRole, TextStyle>;
  /** Derived from the accent; never authored directly. The glow pairs carry the
   *  accent bloom the player's focus treatment adds to the plain ring. */
  ring: {
    focus: string;
    focusSm: string;
    focusLift: string;
    focusGlow: string;
    focusGlowSm: string;
    /** The soft wide wash, for a control whose focus must read as a glow on a
     *  thin shape (the seek bar's track) rather than a crisp outline. */
    focusWash: string;
  };
  /** Derived from the accent wash; never authored directly. */
  glow: { accent: string; play: string };
}

/** What the `ring:` shorthand accepts. */
export type RingToken = keyof Theme['ring'];

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** What `createTheme` accepts: any slice of any group. A name the base does not
 *  have needs its registry augmented first, which is what keeps it typed at
 *  every use site rather than only here. */
export type ThemeOverrides = { [G in keyof ThemeTokens]?: DeepPartial<ThemeTokens[G]> };

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (over === undefined) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(over as Record<string, unknown>)) {
    if (value === undefined) continue;
    const under = out[key];
    out[key] = isPlain(value) && isPlain(under) ? merge(under, value) : value;
  }
  return out as T;
}

function derive(tokens: ThemeTokens): Theme {
  const accent = tokens.colors.accent;
  const glow = {
    accent: `0 6px 22px ${withAlpha(tokens.colors.accentWash, 0.4)}`,
    play: `0 6px 22px ${withAlpha(tokens.colors.accentWash, 0.32)}`,
  };
  return Object.freeze({
    ...tokens,
    type: toType(tokens.typeSpec, tokens.fonts) as Record<TypeRole, TextStyle>,
    ring: {
      focus: `0 0 0 4px ${accent}`,
      focusSm: `0 0 0 3px ${accent}`,
      focusLift: `0 0 0 4px ${accent}, 0 10px 28px rgba(0, 0, 0, 0.5)`,
      focusGlow: `0 0 0 4px ${accent}, ${glow.accent}`,
      focusGlowSm: `0 0 0 3px ${accent}, ${glow.accent}`,
      focusWash: `0 0 0 4px ${withAlpha(tokens.colors.accentWash, 0.28)}`,
    },
    glow,
  });
}

/** The default theme, straight from the token modules. */
export const KROMA: Theme = derive({
  colors,
  radius,
  shadow,
  fonts,
  typeSpec,
  motion,
  gutter,
  space,
  rhythm,
  tracking,
});

export function createTheme(overrides: ThemeOverrides, base: Theme = KROMA): Theme {
  const groups: Record<string, unknown> = {};
  for (const key of GROUPS) groups[key] = merge(base[key], overrides[key]);
  return derive(groups as unknown as ThemeTokens);
}

let active: Theme = KROMA;
// Starts at 1 so a consumer can use 0 (or -1) as "never resolved".
let version = 1;
const listeners = new Set<() => void>();

export function activeTheme(): Theme {
  return active;
}

/** Monotonic; bumped by every `setTheme`. Anything that caches resolved styles
 *  keys on it (see recipe.ts, styles.ts, box-style.ts). */
export function themeVersion(): number {
  return version;
}

export function setTheme(theme: Theme): void {
  if (theme === active) return;
  active = theme;
  version += 1;
  for (const listener of listeners) listener();
}

/** Subscribe to theme swaps; returns the unsubscribe. Shaped for
 *  `useSyncExternalStore`, which is exactly what `useTheme` feeds it to. */
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A value derived from the theme, memoised per swap: call the returned function
 * at use time and it recomputes only when the theme has changed. This is how a
 * module holds something theme-flavoured (a gradient string, a paint bundle)
 * without freezing it to the palette of module-load time.
 */
export function themed<T>(make: (theme: Theme) => T): () => T {
  let at = -1;
  let value: T;
  return () => {
    if (at !== version) {
      value = make(active);
      at = version;
    }
    return value;
  };
}
