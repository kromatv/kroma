// Focus transition, native (Apple TV / Android TV).
//
// Driven by Animated with `useNativeDriver`, so the scale runs on the UI thread
// and never crosses the bridge: the same compositor-only guarantee the web tier
// gets from a CSS transition. See transition.web.ts for the web half.

import { useCallback, useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { motion } from '#ui/core/tokens';
import { type PressScale, pressScaleFor, useLongestSide } from '#ui/lib/press-dip';
import { ease } from './ease';

const EASE = ease.out.native;

/** Nothing to animate: a ring-only focusable adds no style node at all. */
const RING_ONLY: Record<string, unknown> = {};

/** An animated `transform: scale()` that eases to `to` while focused. */
export function useFocusScale(focused: boolean, to: number): Record<string, unknown> {
  const [value] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // A focusable with no scale (to === 1) never animates; skip the work
    // entirely rather than running a no-op timing on every rail tile.
    if (to === 1) return;
    const anim = Animated.timing(value, {
      toValue: focused ? to : 1,
      duration: motion.duration.base,
      easing: EASE,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [focused, to, value]);

  return to === 1 ? RING_ONLY : { transform: [{ scale: value }] };
}

/**
 * The design's press dip (`motion.pressScale`): the control shrinks under the
 * finger, then springs back with a touch of overshoot on release. The touch
 * half of the focus scale above - a phone PRESSES where a television FOCUSES -
 * wired by the kit's pressable paths so every control answers the finger the
 * same way.
 */
export function usePressScale(): PressScale {
  const [pressed, setPressed] = useState(false);
  const [value] = useState(() => new Animated.Value(1));
  const { longest, onLayout } = useLongestSide();

  const onPressIn = useCallback(() => {
    setPressed(true);
    // The dip is immediate feedback, so it eases fast and never bounces.
    Animated.timing(value, {
      toValue: pressScaleFor(longest.current),
      duration: motion.duration.fast,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [value, longest]);

  const onPressOut = useCallback(() => {
    setPressed(false);
    // The release is where the life is: the house spring overshoot.
    Animated.spring(value, { toValue: 1, speed: 30, bounciness: 9, useNativeDriver: true }).start();
  }, [value]);

  return { pressed, style: { transform: [{ scale: value }] }, onLayout, onPressIn, onPressOut };
}
