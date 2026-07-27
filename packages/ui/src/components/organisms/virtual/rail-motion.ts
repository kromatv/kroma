// How the rail moves and fades, in one place for both renderers.
//
// The row's travel and its edge fades share one duration and one curve on
// purpose - they are the same gesture settling - and the curve exists twice
// only because the two renderers spell easing differently: CSS gets the
// bezier as a string, Animated as an Easing. Declared together so they can
// never drift apart.

import { ease } from '#ui/lib/ease';
import { motion } from '#ui/lib/tokens';

/** How the row settles. Short, because this is a cursor moving rather than a
 * transition, and long enough to read as movement rather than a cut. */
export const SETTLE_MS = motion.duration.fast;

export const EASE_CSS = ease.out.css;
export const EASE_NATIVE = ease.out.native;

/** The web-only opacity transition the edge controls fade with, so they come
 * and go with the pointer rather than blinking. react-native-web understands
 * these CSS props; native animates the same values through `Animated`. */
export const FADE = {
  transitionProperty: 'opacity',
  transitionDuration: `${SETTLE_MS}ms`,
  transitionTimingFunction: EASE_CSS,
};
