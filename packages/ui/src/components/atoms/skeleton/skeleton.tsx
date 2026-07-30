// The pulse comes from `useLoop`: a native-driven opacity on a television, a CSS
// keyframe in a browser, never a per-frame JS callback per skeleton.

import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { type BoxStyleProps, boxStyle } from '#ui/lib/box-style';
import { useLoop } from '#ui/lib/loop';
import { colors, motion, radius } from '#ui/lib/tokens';

interface SkeletonProps extends BoxStyleProps {
  style?: StyleProp<ViewStyle>;
}

const WASH = colors.wash;

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
