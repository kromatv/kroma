// Type roles, the source of truth for both renderers (see ../../../vite/tokens.ts).
// Roles store the authored ratio/em and derive the absolute px React Native
// needs, rather than storing px and dividing back (which round-trips lossily).

import type { TextStyle } from 'react-native';
import type { TokenOf } from './registry';

export const fonts = {
  display: 'Bricolage Grotesque',
  ui: 'Hanken Grotesk',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/** The families KROMA serves as woff2. `mono` is absent on purpose: it is a
 *  system stack, so there is no file to name, fingerprint or preload. */
export const SELF_HOSTED: readonly string[] = [fonts.display, fonts.ui];

/** Families a theme adds. Augment it and the name is legal wherever a family is
 *  written: a `font:` shorthand, a role's `family` (see `ColorRegistry`). */
// biome-ignore lint/suspicious/noEmptyInterface: an augmentation point is empty by design
export interface FontRegistry {}

export type FontToken = TokenOf<typeof fonts, FontRegistry>;

/** Tracking as authored, in em. */
export const tracking = {
  overline: 0.12,
  overlineTv: 0.22,
  display: -0.02,
  section: 0.04,
  footnote: 0.02,
  code: 0.0833,
} as const;

export interface TypeSpec {
  family: FontToken;
  weight: '400' | '500' | '600' | '700' | '800';
  size: number;
  /** Line height as a multiple of `size`. */
  ratio: number;
  em?: number;
  uppercase?: boolean;
}

export const typeSpec = {
  hero: { family: 'display', weight: '700', size: 66, ratio: 0.98, em: tracking.display },
  h1: { family: 'display', weight: '700', size: 38, ratio: 1, em: tracking.display },
  heading: { family: 'display', weight: '700', size: 30, ratio: 1.05, em: tracking.display },
  subheading: { family: 'display', weight: '700', size: 26, ratio: 1.07, em: tracking.display },
  h2: { family: 'display', weight: '700', size: 22, ratio: 1.1, em: tracking.display },
  title: { family: 'display', weight: '700', size: 20, ratio: 1.05, em: tracking.display },
  cardTitle: { family: 'display', weight: '700', size: 17, ratio: 1.2, em: tracking.display },
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
  // The 10-foot tier, authored again for three metres rather than scaled up
  // from the phone's, and written here in descending size so the file IS the
  // ladder. Two faces run down it: `display` carries the headings, `ui` carries
  // everything read as text, and a role never crosses from one to the other.
  // The leading tightens as the size grows, which is the one thing worth taking
  // from a utility scale: a step is a size AND its leading, never a size alone.
  codeTv: { family: 'display', weight: '700', size: 96, ratio: 1, em: tracking.code },
  heroTv: { family: 'display', weight: '700', size: 82, ratio: 0.96, em: tracking.display },
  bannerTv: { family: 'display', weight: '700', size: 59, ratio: 0.98, em: tracking.display },
  titleTv: { family: 'display', weight: '600', size: 44, ratio: 1, em: tracking.display },
  headingTv: { family: 'display', weight: '600', size: 32, ratio: 1.05, em: tracking.display },
  subheadingTv: { family: 'display', weight: '600', size: 28, ratio: 1.07, em: tracking.display },
  bodyTv: { family: 'ui', weight: '400', size: 20, ratio: 1.5 },
  leadTv: { family: 'ui', weight: '500', size: 17, ratio: 1.4 },
  labelTv: { family: 'ui', weight: '600', size: 17, ratio: 1.3 },
  strongTv: { family: 'ui', weight: '700', size: 17, ratio: 1.3 },
  captionTv: { family: 'ui', weight: '400', size: 15, ratio: 1.47 },
  metaTv: { family: 'ui', weight: '500', size: 15, ratio: 1.4 },
  sectionTv: { family: 'ui', weight: '700', size: 15, ratio: 1.2, em: tracking.section },
  footnoteTv: { family: 'ui', weight: '600', size: 13, ratio: 1.23, em: tracking.footnote },
  /** The eyebrow at 10-foot distance: authored wider, not the phone's tracking
   * scaled up. `fontSize` may be overridden - <Text> re-derives from the em. */
  overlineTv: {
    family: 'ui',
    weight: '700',
    size: 13,
    ratio: 1.23,
    em: tracking.overlineTv,
    uppercase: true,
  },
} as const satisfies Record<string, TypeSpec>;

/** The base tier, largest first: what the web client, the desktop shell and the
 *  phone-facing components read. Same order and the same purpose as
 *  {@link TV_RAMP}. */
export const BASE_RAMP = [
  'hero',
  'h1',
  'heading',
  'subheading',
  'h2',
  'title',
  'cardTitle',
  'body',
  'label',
  'meta',
  'overline',
] as const satisfies readonly (keyof typeof typeSpec)[];

/** The 10-foot tier, largest first. The ramp's own order, so a caller reaching
 *  for "one step down" reads it off rather than guessing, and so the invariants
 *  that keep it a ramp have something to run over. */
export const TV_RAMP = [
  'codeTv',
  'heroTv',
  'bannerTv',
  'titleTv',
  'headingTv',
  'subheadingTv',
  'bodyTv',
  'leadTv',
  'labelTv',
  'strongTv',
  'captionTv',
  'metaTv',
  'sectionTv',
  'footnoteTv',
  'overlineTv',
] as const satisfies readonly (keyof typeof typeSpec)[];

/** Roles a theme adds. Augment it and the name is legal wherever a role is
 *  written: a recipe's `text:` shorthand, <Text variant> (see `ColorRegistry`). */
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
