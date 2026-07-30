// The mobile app's design vocabulary, sourced entirely from @kroma/ui: this
// file only maps the design system's tokens onto the names the mobile screens
// already use, so a colour never drifts between phone, TV and web.
//
// One rename to know: this app's `textDim`/`textFaint` are the design
// system's `textMuted`/`textDim` swapped — the mapping below keeps the app's
// names but takes the system's values.

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
  // 62% ink; the design system calls this `textMuted`.
  textDim: kit.textMuted,
  // 45% ink; the design system calls this `textDim`.
  textFaint: kit.textDim,
  accent: kit.accent,
  accentBright: kit.accentBright,
  accentSoft: kit.accentSoft,
  accentInk: kit.accentInk,
  success: kit.success,
  info: kit.info,
  danger: kit.danger,
  // Reused by the notification centre as category tints, so its glyphs read
  // the same on the phone as in the browser.
  hdr: kit.hdr,
  h265: kit.h265,
} as const;

// React Native's silent default text colour is black, invisible on this app's
// near-black surfaces; this ramp bakes in ink so no role needs it spelled
// out, though a colour after `...type.x` in a spread still overrides it.
export const type = {
  display: { ...mobileType.display, color: kit.text },
  title: { ...mobileType.title, color: kit.text },
  heading: { ...mobileType.heading, color: kit.text },
  section: { ...mobileType.section, color: kit.text },
  body: { ...mobileType.body, color: kit.text },
  caption: { ...mobileType.caption, color: kit.textMuted },
  small: { ...mobileType.small, color: kit.textMuted },
} as const;

export const TAB_BAR_CLEARANCE = 108;

/** Poster card sizing: phones get ~3 columns, tablets scale up. */
export function posterWidth(windowWidth: number): number {
  let cols = 3;
  if (windowWidth >= 900) cols = 6;
  else if (windowWidth >= 600) cols = 4;
  return Math.floor((windowWidth - 16 * 2 - 12 * (cols - 1)) / cols);
}
