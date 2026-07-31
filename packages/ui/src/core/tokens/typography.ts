// Type roles, the source of truth for both renderers (see gen-token-css.ts).
// Roles store the authored ratio/em and derive the absolute px React Native
// needs, rather than storing px and dividing back (which round-trips lossily).

import type { TextStyle } from 'react-native';
import type { TokenOf } from './registry';

export const fonts = {
  display: 'Bricolage Grotesque',
  ui: 'Hanken Grotesk',
} as const;

/** Families a theme adds. Augment it and the name is legal wherever a family is
 *  written — a `font:` shorthand, a role's `family` (see `ColorRegistry`). */
// biome-ignore lint/suspicious/noEmptyInterface: an augmentation point is empty by design
export interface FontRegistry {}

export type FontToken = TokenOf<typeof fonts, FontRegistry>;

/** Tracking as authored, in em. */
export const tracking = { overline: 0.12, overlineTv: 0.22, display: -0.02 } as const;

export interface TypeSpec {
  family: FontToken;
  weight: '400' | '500' | '600' | '700';
  size: number;
  /** Line height as a multiple of `size`. */
  ratio: number;
  em?: number;
  uppercase?: boolean;
}

export const typeSpec = {
  hero: { family: 'display', weight: '700', size: 66, ratio: 0.98, em: tracking.display },
  h1: { family: 'display', weight: '700', size: 38, ratio: 1, em: tracking.display },
  h2: { family: 'display', weight: '700', size: 22, ratio: 1.1, em: tracking.display },
  title: { family: 'display', weight: '700', size: 20, ratio: 1.05, em: tracking.display },
  body: { family: 'ui', weight: '400', size: 16, ratio: 1.55 },
  label: { family: 'ui', weight: '600', size: 15, ratio: 1.3 },
  meta: { family: 'ui', weight: '500', size: 13, ratio: 1.4 },
  overline: {
    family: 'ui',
    weight: '700',
    size: 11,
    ratio: 1,
    em: tracking.overline,
    uppercase: true,
  },
  /** The eyebrow at 10-foot distance: authored wider, not the phone's tracking
   * scaled up. `fontSize` may be overridden - <Txt> re-derives from the em. */
  overlineTv: {
    family: 'ui',
    weight: '700',
    size: 13,
    ratio: 1.23,
    em: tracking.overlineTv,
    uppercase: true,
  },
} as const satisfies Record<string, TypeSpec>;

/** Roles a theme adds. Augment it and the name is legal wherever a role is
 *  written — a recipe's `text:` shorthand, <Txt variant> (see `ColorRegistry`). */
// biome-ignore lint/suspicious/noEmptyInterface: an augmentation point is empty by design
export interface TypeRoleRegistry {}

export type TypeRole = TokenOf<typeof typeSpec, TypeRoleRegistry>;

const px = (n: number) => Math.round(n * 100) / 100;

/**
 * Derives the finished text styles from the authored specs against a set of
 * families. Parameterised because a theme can restate either side: `createTheme`
 * re-derives, so a swapped display font reaches every role that names it.
 */
export function toType(
  spec: Readonly<Record<string, TypeSpec>>,
  families: Readonly<Record<string, string>>,
): Record<string, TextStyle> {
  const out: Record<string, TextStyle> = {};
  for (const [role, s] of Object.entries(spec)) {
    out[role] = {
      fontFamily: families[s.family as string] ?? (s.family as string),
      fontWeight: s.weight,
      fontSize: s.size,
      lineHeight: Math.round(s.size * s.ratio),
      ...(s.em === undefined ? null : { letterSpacing: px(s.size * s.em) }),
      ...(s.uppercase ? { textTransform: 'uppercase' as const } : null),
    };
  }
  return out;
}

export const type = toType(typeSpec, fonts) as Record<TypeRole, TextStyle>;
