// What a theme is, and how one is made.
//
// A theme is a plain object. `createTheme` deep-merges overrides over a base and
// re-derives the bundles that follow from other groups (the type roles from
// `typeSpec` + `fonts`, the focus ring from the accent), so overriding one side
// updates everything built on it.
//
// Adding a token GROUP is adding a key to `ThemeTokens` and a base value below.
// Adding a NAME to a group is a registry augmentation (see `ColorRegistry`) plus
// the value in `createTheme`, which is what types the name everywhere the
// vocabulary reaches.

import type { TextStyle } from 'react-native';
import { type ColorToken, colors, lightColors, withAlpha } from './tokens/colors';
import { CSS_COLORS, CSS_SHADOWS } from './tokens/css-palette';
import {
  lightShadow,
  motion,
  type RingStyle,
  type ShadowToken,
  shadow,
  standoff,
  standoffInside,
  WASH_ALPHA,
} from './tokens/effects';
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
    focus: RingStyle;
    focusSm: RingStyle;
    focusLift: RingStyle;
    focusGlow: RingStyle;
    focusGlowSm: RingStyle;
    /** The soft wide wash, for a control whose focus must read as a glow on a
     *  thin shape (the seek bar's track) rather than a crisp outline. */
    focusWash: RingStyle;
    /** The ring, inward: for a control flush with whatever clips it. */
    focusInset: RingStyle;
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

// Only a token still holding its built-in value may resolve to a custom property:
// an override is a decision the cascade knows nothing about.
function paint<K extends string>(
  group: Record<K, string>,
  builtin: Record<K, string>,
  vars: Readonly<Record<K, string>> | null,
): Record<K, string> {
  if (!vars) return group;
  const out = {} as Record<K, string>;
  for (const key of Object.keys(group) as K[]) {
    out[key] = group[key] === builtin[key] ? vars[key] : group[key];
  }
  return out;
}

function derive(base: ThemeTokens): Theme {
  const tokens: ThemeTokens = {
    ...base,
    colors: paint(base.colors, colors, CSS_COLORS),
    shadow: paint(base.shadow, shadow, CSS_SHADOWS),
  };
  const accent = tokens.colors.accent;
  const glow = {
    accent: `0 6px 22px ${withAlpha(tokens.colors.accentWash, WASH_ALPHA.glow / 100)}`,
    play: `0 6px 22px ${withAlpha(tokens.colors.accentWash, WASH_ALPHA.play / 100)}`,
  };
  return Object.freeze({
    ...tokens,
    type: toType(tokens.typeSpec, tokens.fonts) as Record<TypeRole, TextStyle>,
    // Every ring is one width standing one gap off the control (see
    // tokens/effects): a themed accent retints them, it does not get to
    // re-decide how thick focus is or how far off it sits.
    ring: {
      focus: standoff(accent),
      focusSm: standoff(accent),
      focusLift: standoff(accent, tokens.shadow.pop),
      focusGlow: standoff(accent, glow.accent),
      focusGlowSm: standoff(accent, glow.accent),
      focusWash: standoff(withAlpha(tokens.colors.accentWash, WASH_ALPHA.ring / 100)),
      focusInset: standoffInside(accent),
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

/** KROMA on a warm paper ground. */
export const KROMA_LIGHT: Theme = derive({
  colors: lightColors,
  radius,
  shadow: lightShadow,
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
