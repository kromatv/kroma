// <Skeleton>: the pulsing loading placeholder.
//
// The pulse comes from `useLoop`, so the one component works on every target:
// a native-driven opacity on a television, a CSS keyframe in a browser. It
// matters more here than anywhere else in the kit because skeletons come by the
// screenful - a loading grid is dozens of them at once, and on the browser
// targets each used to be its own per-frame JS callback (lib/loop.web.ts).

import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { type BoxStyleProps, boxStyle } from '#ui/lib/box-style';
import { useLoop } from '#ui/lib/loop';
import { colors, motion, radius } from '#ui/lib/tokens';

interface SkeletonProps extends BoxStyleProps {
  style?: StyleProp<ViewStyle>;
}

/** The wash the placeholder pulses between - a token, because the admin
 * contract's DOM skeleton pulses the same one (`bg-wash`). */
const WASH = colors.wash;

/** A full breath: down and back. */
const PULSE_MS = motion.duration.slow * 4;

function Skeleton({ style, ...box }: Readonly<SkeletonProps>) {
  const pulse = useLoop('pulse', PULSE_MS);

  return (
    <Animated.View
      style={[{ backgroundColor: WASH, borderRadius: radius.sm }, boxStyle(box), style, pulse]}
    />
  );
}

export type { SkeletonProps };
export { Skeleton };
