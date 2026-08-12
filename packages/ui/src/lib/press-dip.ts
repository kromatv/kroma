// How deep a press sinks a control. Not one percentage: a flat scale reads as
// a 3px dip on a button and a 45px collapse on a full-width row, so the scale
// is derived from the control's own size to land the same PIXEL travel on
// everything. `motion.pressScale` stays as the floor: the deepest a small
// control goes, and what an unmeasured control falls back to.

import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { motion } from '#ui/core/tokens';

/** Total edge travel a press aims for, in px, on the control's longest side. */
const DIP_PX = 6;

export function pressScaleFor(longest: number): number {
  if (longest <= 0) return motion.pressScale;
  return Math.max(motion.pressScale, 1 - DIP_PX / longest);
}

export function longestSideOf(event: LayoutChangeEvent): number {
  const { width, height } = event.nativeEvent.layout;
  return Math.max(width, height);
}

/** The control's longest side, kept current by the `onLayout` it hands back.
 *  A ref rather than state: the size only matters at the moment of a press, and
 *  a re-render on every layout pass would cost every tile in a grid. */
export function useLongestSide(): {
  longest: { current: number };
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const longest = useRef(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    longest.current = longestSideOf(event);
  }, []);
  return { longest, onLayout };
}

/** What both halves of the press dip hand back; the animation itself is the
 *  platform's (Animated on native, a CSS transition on the web). */
export interface PressScale {
  pressed: boolean;
  style: Record<string, unknown>;
  onLayout: (event: LayoutChangeEvent) => void;
  onPressIn: () => void;
  onPressOut: () => void;
}
