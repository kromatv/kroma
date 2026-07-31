// The motion tokens' bezier curves, compiled once into the two forms the kit
// animates with. `motion.bezier.*` is control points, since the CSS generator
// turns them into `cubic-bezier(...)` custom properties and cannot import
// react-native to do it. Compiling here once keeps the cast a readonly tuple
// needs to satisfy `Easing.bezier`'s four positional parameters in one place.

import { Easing, type EasingFunction } from 'react-native';
import { motion } from '#ui/core/tokens';

type Curve = keyof typeof motion.bezier;

/** One curve in both dialects: `css` for react-native-web's transition props,
 * `native` for `Animated.timing({ easing })`. */
export interface Ease {
  css: string;
  native: EasingFunction;
}

function compile(points: (typeof motion.bezier)[Curve]): Ease {
  const [x1, y1, x2, y2] = points;
  return { css: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`, native: Easing.bezier(x1, y1, x2, y2) };
}

/** The kit's easing curves. `out` is the settle every focus move and fade uses;
 * `spring` overshoots, for the capsule that chases a finger. */
export const ease: Record<Curve, Ease> = {
  out: compile(motion.bezier.out),
  spring: compile(motion.bezier.spring),
};
