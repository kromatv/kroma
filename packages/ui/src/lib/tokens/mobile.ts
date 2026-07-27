// The MOBILE form-factor scale.
//
// The palette, the brand and the motion are shared with the 10-foot design and
// live in the other token files. What genuinely differs is scale: a phone is
// held at arm's length and a TV is watched from three metres, so the type ramp
// is smaller and the corners are rounder. Those are design decisions, not
// drift, which is exactly why they belong HERE rather than in the mobile app:
// one design system, two form factors, both in one place.
//
// Where the 10-foot scale is authored on a fixed 1920x1080 canvas (see CANVAS),
// the mobile scale is authored against a real device's points, so its numbers
// are read as-is with no stage in between.

import type { TextStyle } from 'react-native';

/** Rounder than the 10-foot radii: a phone's chrome sits closer to the eye and
 * a tighter corner reads as sharp rather than crisp. */
export const mobileRadius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 28,
  pill: 999,
} as const;

/** The phone's spacing ramp, named by t-shirt size the way the screens read it. */
export const mobileSpace = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Type roles for a phone. Same families and the same weights as the 10-foot
 * ramp, at the sizes a hand-held screen wants. Colour is applied by the
 * component, not baked in, so a role can be reused on any surface. */
export const mobileType = {
  display: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  section: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
  small: { fontSize: 11, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export type MobileTypeRole = keyof typeof mobileType;

/** The display family, for the few places a phone screen wants the title face. */
export { fonts as mobileFonts } from './typography';
