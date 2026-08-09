// How deep a press sinks a control. Not one percentage: a flat scale reads as
// a 3px dip on a button and a 45px collapse on a full-width row, so the scale
// is derived from the control's own size to land the same PIXEL travel on
// everything. `motion.pressScale` stays as the floor: the deepest a small
// control goes, and what an unmeasured control falls back to.

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
