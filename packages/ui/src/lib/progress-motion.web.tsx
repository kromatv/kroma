// How a determinate bar and ring reach a new value, web (Tizen / webOS /
// desktop / browser).
//
// CSS transitions rather than Animated: react-native-web drops
// `useNativeDriver`, leaving a JS timer that writes an inline style every frame.
// See progress-motion.tsx for the native half.

import { type StyleProp, View, type ViewStyle } from 'react-native';
import { style } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { classes } from '#ui/lib/classed';
import { ease } from '#ui/lib/ease';
import type { RingGeometry } from '#ui/lib/ring';

export interface ProgressFillProps {
  value: number;
  style: StyleProp<ViewStyle>;
}

const ARC_TRANSITION = style({
  transitionProperty: 'stroke-dashoffset',
  transitionDuration: `${motion.duration.base}ms`,
  transitionTimingFunction: ease.out.css,
});

const FILL_TRANSITION = style({
  transitionProperty: 'right',
  transitionDuration: `${motion.duration.base}ms`,
  transitionTimingFunction: ease.out.css,
});

/** The arc of a <ProgressRing>, easing to a new length when the value changes. */
export function ProgressArc({
  centre,
  radius,
  thickness,
  fill,
  circumference,
  dashOffset,
}: Readonly<RingGeometry>) {
  return (
    <circle
      cx={centre}
      cy={centre}
      r={radius}
      fill="none"
      stroke={fill}
      strokeWidth={thickness}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={dashOffset}
      className={classes(ARC_TRANSITION)}
    />
  );
}

/** The fill of a <Progress> track, easing to `value` (0..1). `style` paints it
 *  and pins it to the track's left edge; the trailing inset is this component's. */
export function ProgressFill({ value, style }: Readonly<ProgressFillProps>) {
  const trailing = `${(1 - value) * 100}%` as const;

  return <View style={[style, FILL_TRANSITION, { right: trailing }]} />;
}
