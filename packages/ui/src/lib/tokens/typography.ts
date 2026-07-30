// Type roles, the source of truth for both renderers (see gen-token-css.ts).
// Roles store the authored ratio/em and derive the absolute px React Native
// needs, rather than storing px and dividing back (which round-trips lossily).

import type { TextStyle } from 'react-native';

export const fonts = {
  display: 'Bricolage Grotesque',
  ui: 'Hanken Grotesk',
} as const;

/** Tracking as authored, in em. */
export const tracking = { overline: 0.12, overlineTv: 0.22, display: -0.02 } as const;

export interface TypeSpec {
  family: keyof typeof fonts;
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

export type TypeRole = keyof typeof typeSpec;

const px = (n: number) => Math.round(n * 100) / 100;

function toStyle(s: TypeSpec): TextStyle {
  return {
    fontFamily: fonts[s.family],
    fontWeight: s.weight,
    fontSize: s.size,
    lineHeight: Math.round(s.size * s.ratio),
    ...(s.em === undefined ? null : { letterSpacing: px(s.size * s.em) }),
    ...(s.uppercase ? { textTransform: 'uppercase' as const } : null),
  };
}

export const type = Object.fromEntries(
  Object.entries(typeSpec).map(([k, v]) => [k, toStyle(v)]),
) as Record<TypeRole, TextStyle>;
