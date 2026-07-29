// The mobile app's design vocabulary, sourced entirely from @kroma/ui.
//
// Nothing here holds a VALUE. The palette, the brand wheel and the shade stops
// are the design system's 10-foot tokens (they are the same colours on every
// form factor); the radii, spacing and type ramp are its mobile scale. This file
// only maps them onto the names the mobile screens already use, so a colour can
// never drift between the phone, the TV and the web again.
//
// The one rename worth knowing about: this app has always called
// `colors.textDim` the 62% ink and `colors.textFaint` the 45% one, while the
// design system calls those `textMuted` and `textDim`. The mapping below keeps
// the app's meaning and takes the system's values.

import { colors as kit, mobileType } from '@kroma/ui/kit';

// Straight pass-throughs: re-exported rather than rebound, so no local name
// stands between the screens and the token they are actually using.
export {
  absoluteFill,
  mobileRadius as radius,
  mobileSpace as spacing,
  SHADE,
  shade,
  WHEEL_COLORS,
} from '@kroma/ui/kit';

export const colors = {
  bg: kit.bg,
  surface: kit.surface1,
  surfaceRaised: kit.surface2,
  surfaceHigh: kit.surface3,
  border: kit.border,
  borderStrong: kit.borderStrong,
  overlay: kit.overlay,
  text: kit.text,
  /** 62% ink. The design system calls this `textMuted`. */
  textDim: kit.textMuted,
  /** 45% ink. The design system calls this `textDim`. */
  textFaint: kit.textDim,
  accent: kit.accent,
  accentBright: kit.accentBright,
  accentSoft: kit.accentSoft,
  accentInk: kit.accentInk,
  success: kit.success,
  info: kit.info,
  danger: kit.danger,
  /** The quality-badge hues, borrowed as category tints by the notification
   * centre so its glyphs read the same on the phone as in the browser. */
  hdr: kit.hdr,
  h265: kit.h265,
} as const;

/**
 * The phone type ramp, INKED. The kit's `mobileType` deliberately bakes no
 * colour (a role must be reusable on any surface), but this app's screens
 * spread `...type.x` everywhere and mostly say nothing about colour - and
 * React Native's silent default is BLACK, which on this app's near-black
 * surfaces rendered every unlabelled heading invisible. So the app's own ramp
 * carries the app's default ink; a style that wants another colour already
 * spells it after the spread, where it still wins.
 */
export const type = {
  display: { ...mobileType.display, color: kit.text },
  title: { ...mobileType.title, color: kit.text },
  heading: { ...mobileType.heading, color: kit.text },
  section: { ...mobileType.section, color: kit.text },
  body: { ...mobileType.body, color: kit.text },
  caption: { ...mobileType.caption, color: kit.textMuted },
  small: { ...mobileType.small, color: kit.textMuted },
} as const;

/** Height of the floating (translucent) tab bar; tab screens pad their scroll
 * content by this so the last row clears it. */
export const TAB_BAR_CLEARANCE = 108;

/** Poster card sizing: phones get ~3 columns, tablets scale up. */
export function posterWidth(windowWidth: number): number {
  let cols = 3;
  if (windowWidth >= 900) cols = 6;
  else if (windowWidth >= 600) cols = 4;
  return Math.floor((windowWidth - 16 * 2 - 12 * (cols - 1)) / cols);
}
