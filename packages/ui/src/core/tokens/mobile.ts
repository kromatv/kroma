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
import { fonts, type TypeSpec, toType } from './typography';

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
/**
 * Authored as SPECS, not as finished styles, for the same reason the 10-foot
 * ramp is: a spec carries the line-height ratio and the tracking in em, so a
 * role keeps its proportions at whatever size a call site asks for, and a theme
 * can restate the families without every role being rewritten.
 *
 * The ratios tighten as the size grows, which is what a phone wants: a 34pt
 * screen title set at body leading looks airy and wastes a third of the fold,
 * and 13pt caption set at title leading runs together.
 */
export const mobileTypeSpec = {
  display: { family: 'display', weight: '800', size: 34, ratio: 1.18, em: -0.0235 },
  title: { family: 'display', weight: '800', size: 28, ratio: 1.21, em: -0.0179 },
  heading: { family: 'ui', weight: '700', size: 20, ratio: 1.3, em: -0.015 },
  section: { family: 'ui', weight: '700', size: 18, ratio: 1.33, em: -0.0167 },
  body: { family: 'ui', weight: '400', size: 15, ratio: 1.47 },
  caption: { family: 'ui', weight: '400', size: 13, ratio: 1.38 },
  small: { family: 'ui', weight: '600', size: 11, ratio: 1.45 },
} as const satisfies Record<string, TypeSpec>;

/** Exactly the keys `toType` emits, and no wider: these roles are SPREAD into
 *  `styles({...})` declarations, and a full `TextStyle` there drags two hundred
 *  optional properties into a shape that only wants five. */
type MobileRoleStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontWeight' | 'fontSize' | 'lineHeight' | 'letterSpacing'
>;

/** The finished phone roles, derived from the specs above exactly as the
 *  10-foot ones are (see `toType`) — so they carry a line height rather than
 *  leaving each platform's default leading to decide. */
export const mobileType = toType(mobileTypeSpec, fonts) as Record<MobileTypeRole, MobileRoleStyle>;

export type MobileTypeRole = keyof typeof mobileTypeSpec;

/** The display family, for the few places a phone screen wants the title face. */
export { fonts as mobileFonts } from './typography';
