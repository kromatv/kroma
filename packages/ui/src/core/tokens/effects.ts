// Elevation, focus rings and motion.
//
// Shadows are `boxShadow` strings rather than the legacy iOS shadow* props:
// React Native 0.76+ implements boxShadow on both native platforms, and
// react-native-web maps it straight to CSS. One value, three renderers.

import { colors } from './colors.ts';
import type { TokenOf } from './registry';

export const shadow = {
  card: '0 10px 28px rgba(0, 0, 0, 0.45)',
  pop: '0 20px 50px rgba(0, 0, 0, 0.55)',
  hero: '0 20px 50px rgba(0, 0, 0, 0.6)',
} as const;

/** The same elevations on paper: a tight contact shadow under a wide, very
 *  faint ambient one, where the dark ground's single opaque drop would smear. */
export const lightShadow: Record<keyof typeof shadow, string> = {
  card: '0 1px 2px rgba(22, 21, 26, 0.06), 0 8px 24px rgba(22, 21, 26, 0.06)',
  pop: '0 2px 4px rgba(22, 21, 26, 0.08), 0 16px 40px rgba(22, 21, 26, 0.1)',
  hero: '0 2px 6px rgba(22, 21, 26, 0.08), 0 24px 60px rgba(22, 21, 26, 0.12)',
};

/** Shadows a theme adds. Augment it and the name is legal wherever an elevation
 *  is written: the `shadow:` shorthand, <Box shadow> (see `ColorRegistry`). */
// biome-ignore lint/suspicious/noEmptyInterface: an augmentation point is empty by design
export interface ShadowRegistry {}

export type ShadowToken = TokenOf<typeof shadow, ShadowRegistry>;

/** ONE ring width, everywhere. A control's focus visual is how a viewer keeps
 * their place, so it must not change thickness as focus travels from a button
 * to a field to a row: three widths across the kit read as three different
 * kinds of focus. Every ring below, and the field outline the web draws in
 * CSS, are this number. */
export const RING_WIDTH = 4;

/** How far the ring stands OFF the control it marks. The ring reads as a frame
 * around the thing rather than a border on it, which is what keeps it legible
 * over artwork at ten feet.
 *
 * Spent as an outline offset rather than as padding inside each component, and
 * that is what keeps the corners honest: an outline follows the element's own
 * radius, so the ring stays concentric with whatever it surrounds for free.
 * Done with padding, every component owes the same sum by hand - outer = inner
 * + gap - and gets it wrong (a 6px frame around a 13px corner needs a 19px
 * radius, not 16). */
export const RING_GAP = 6;

/** How much room a focused control needs beside it, for anything that clips or
 * abuts it - a scroll view's edge, the capsule a nav item sits in: the gap, the
 * ring itself, and a hair more so the ring never lands on the very pixel that
 * clips it. */
export const RING_ROOM = RING_GAP + RING_WIDTH + 2;

/** A focus ring, as a style: an outline standing `RING_GAP` off the control,
 * optionally over a shadow. */
export interface RingStyle {
  outlineStyle: 'solid';
  outlineWidth: number;
  outlineColor: string;
  outlineOffset: number;
  boxShadow?: string;
}

/** The 10-foot focus treatment: a CLEAN solid amber ring plus a dark drop
 * shadow for lift, never an amber bloom, so the ring reads as a crisp border. */
// An outline and not a box-shadow, and that is the whole reason the gap is
// really a gap: a shadow is a FILLED shape, so a transparent one under an
// accent one paints nothing and the two read as a single thick band. An
// outline is a stroke standing `outlineOffset` off the border box, so what
// sits between the control and the ring is whatever is behind them - the
// artwork, the screen - and the corner follows the control's own radius
// instead of every component owing the sum by hand.
export function standoff(color: string, lift?: string): RingStyle {
  return {
    outlineStyle: 'solid',
    outlineWidth: RING_WIDTH,
    outlineColor: color,
    outlineOffset: RING_GAP,
    ...(lift ? { boxShadow: lift } : null),
  };
}

/** The same ring, drawn INSIDE the control: for a row that is flush with the
 * card clipping it (a <ListRow.Group> member), where there is no outside to
 * stand off into. Same width, same ink, the same gap - measured inward. */
export function standoffInside(color: string): RingStyle {
  return { ...standoff(color), outlineOffset: -(RING_GAP + RING_WIDTH) };
}

/** The steps the theme derives from the accent wash, as the `/NN` percentages a
 *  colour is written with everywhere else. The build emits one property per
 *  step, so a new one has to be added to the derived list in `vite/tokens.ts`. */
export const WASH_ALPHA = { glow: 40, play: 32, ring: 28 } as const;

export const LIFT_SHADOW = '0 10px 28px rgba(0, 0, 0, 0.5)';

export const ring = {
  focus: standoff(colors.accent),
  /** Kept as a name callers already use; the same width as the rest. */
  focusSm: standoff(colors.accent),
  /** Ring + lift, the combination every focusable actually renders. */
  focusLift: standoff(colors.accent, LIFT_SHADOW),
  /** For a control with no outside: see `standoffInside`. */
  focusInset: standoffInside(colors.accent),
} as const;

export const glow = {
  accent: '0 6px 22px rgba(242, 180, 66, 0.4)',
  play: '0 6px 22px rgba(242, 180, 66, 0.32)',
} as const;

/** Motion. Durations in milliseconds (React Native's Animated unit); the CSS
 * generator emits seconds. Easing curves are bezier control points, consumable
 * by both `Easing.bezier(...)` and `cubic-bezier(...)`. */
export const motion = {
  bezier: {
    out: [0.22, 1, 0.36, 1],
    spring: [0.34, 1.56, 0.64, 1],
  },
  duration: { fast: 150, base: 200, slow: 400 },
  /** Buttons shrink on press; cards lift on focus. */
  pressScale: 0.95,
  focusLift: -6,
} as const;
