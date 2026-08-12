// Focus transition, web (Tizen / webOS / desktop / browser).
//
// A CSS transition rather than Animated: on a TV's weak CPU a JS interpolation
// of 20 visible rail tiles is a frame-rate cliff, while `transition: transform`
// stays on the compositor. Only `transform` is transitioned - transitioning
// `box-shadow` (the focus ring: blurred and drawn outside the element's box)
// cost a third of the frame rate on a Samsung LS03D, so the ring does not fade.

import { useCallback, useState } from 'react';
import { motion } from '#ui/core/tokens';
import { type PressScale, pressScaleFor, useLongestSide } from '#ui/lib/press-dip';
import { ease } from './ease';

const DURATION = `${motion.duration.base}ms`;
const TIMING = ease.out.css;

// No `transform` at all: it would promote every tile in a browse grid to its own
// compositing layer, which a TV GPU pays for even at scale 1.
const RING_ONLY = {} as const;

export function useFocusScale(focused: boolean, to: number): Record<string, unknown> {
  if (to === 1) return RING_ONLY;
  return {
    transform: [{ scale: focused ? to : 1 }],
    transitionProperty: 'transform',
    transitionDuration: DURATION,
    transitionTimingFunction: TIMING,
  };
}

const DURATION_FAST = `${motion.duration.fast}ms`;
const SPRING = ease.spring.css;

export function usePressScale(): PressScale {
  const [pressed, setPressed] = useState(false);
  const { longest, onLayout } = useLongestSide();
  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);
  return {
    pressed,
    onLayout,
    style: {
      transform: [{ scale: pressed ? pressScaleFor(longest.current) : 1 }],
      transitionProperty: 'transform',
      transitionDuration: DURATION_FAST,
      transitionTimingFunction: SPRING,
    },
    onPressIn,
    onPressOut,
  };
}
