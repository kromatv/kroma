// The mobile app's design vocabulary, sourced entirely from @kroma/ui: this
// file only maps the design system's tokens onto the names the mobile screens
// already use, so a colour never drifts between phone, TV and web.
//
// One rename to know: this app's `textDim`/`textFaint` are the design
// system's `textMuted`/`textDim` swapped — the mapping below keeps the app's
// names but takes the system's values.

import {
  activeTheme,
  createTheme,
  groundShade,
  KROMA_LIGHT,
  colors as kit,
  mobileRadius,
  mobileType,
  mobileTypeSpec,
  onPaper,
  type Theme,
  type ThemeOverrides,
} from '@kroma/ui/kit';

const FORM_FACTOR: ThemeOverrides = {
  typeSpec: { body: mobileTypeSpec.body, title: mobileTypeSpec.title },
  radius: mobileRadius,
};

/**
 * The phone's form factor, as a theme the design system actually runs on.
 *
 * Without it the kit renders a phone at its 10-foot defaults: a <Txt> resolves
 * `variant` against the TV role table, and `sizeFix` re-derives a line height
 * from the TV body's 1.55 ratio. The corners are the phone's for the same
 * reason - a kit control here should be shaped for a hand, not for a room, and
 * `@kroma/ui` already authors both scales (core/tokens/mobile).
 *
 * Only the roles the two ramps SHARE are restated, which is the point of a
 * form-factor theme: on a phone, `body` and `title` mean the phone's sizes. The
 * phone-only roles (display, heading, section, caption, small) stay out of the
 * theme deliberately - a role name has to be registered globally to be legal in
 * `variant`, and that would make the base theme owe values for five names the
 * 10-foot ramp has no opinion about. They reach the screens through `type`
 * below, which is spec-derived and so now carries their real line heights.
 */
export const MOBILE = createTheme(FORM_FACTOR);

/** The same form factor on the paper ground. `applyMode` swaps the BASE theme,
 *  so without a light twin a phone that chooses the light ground would also
 *  lose its type ramp and its corners. */
export const MOBILE_LIGHT = createTheme(FORM_FACTOR, KROMA_LIGHT);

/** The phone's theme for whichever ground is currently set. */
export function mobileTheme(ground: Theme = activeTheme()): Theme {
  return onPaper(ground) ? MOBILE_LIGHT : MOBILE;
}

// Straight pass-throughs: re-exported rather than rebound, so no local name
// stands between the screens and the token they are actually using.
export {
  absoluteFill,
  groundShade,
  mobileRadius as radius,
  mobileSpace as spacing,
  WHEEL_COLORS,
} from '@kroma/ui/kit';

/** The stops artwork fades into, on whichever ground is active. Not the kit's
 *  `SHADE`, which names the dark one and would band black across a hero on
 *  paper. Call it during render. */
export function shades(): { transparent: string; mid: string; full: string } {
  return { transparent: groundShade(0), mid: groundShade(0.55), full: groundShade(1) };
}

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
// out, though a colour after `...type.x` in a spread still overrides it. The
// ink is the token NAME, so a role re-resolves when the ground swaps.
//
// Prefer `<Txt variant="caption">` in new code: the role then carries its own
// line height and tracking, and this spread is only still here for the styles()
// declarations that predate the theme.
export const type = {
  display: { ...mobileType.display, color: 'text' },
  title: { ...mobileType.title, color: 'text' },
  heading: { ...mobileType.heading, color: 'text' },
  section: { ...mobileType.section, color: 'text' },
  body: { ...mobileType.body, color: 'text' },
  caption: { ...mobileType.caption, color: 'textMuted' },
  small: { ...mobileType.small, color: 'textMuted' },
} as const;

export const TAB_BAR_CLEARANCE = 108;

/** Poster card sizing: phones get ~3 columns, tablets scale up. */
export function posterWidth(windowWidth: number): number {
  let cols = 3;
  if (windowWidth >= 900) cols = 6;
  else if (windowWidth >= 600) cols = 4;
  return Math.floor((windowWidth - 16 * 2 - 12 * (cols - 1)) / cols);
}
