// How a determinate bar and ring reach a new value, native (Apple TV /
// Android TV / phone).
//
// The JS driver, unavoidably: neither a percentage inset nor an SVG dash offset
// is a native-driver property. See progress-motion.web.tsx for the browser half,
// which spells both as CSS transitions.

import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import type { RingGeometry } from '#ui/lib/ring';
import { Circle } from '#ui/lib/svg';

export interface ProgressFillProps {
  value: number;
  style: StyleProp<ViewStyle>;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function useSettling(to: number): Animated.Value {
  const value = useRef(new Animated.Value(to)).current;
  const target = useRef(to);

  useEffect(() => {
    // A first render mounts AT the value: a browse grid of half-watched tiles
    // must not animate two dozen bars into place.
    if (target.current === to) return;
    target.current = to;
    const anim = Animated.timing(value, {
      toValue: to,
      duration: motion.duration.base,
      easing: ease.out.native,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [to, value]);

  return value;
}

/** The arc of a <ProgressRing>, easing to a new length when the value changes. */
export function ProgressArc({
  centre,
  radius,
  stroke,
  fill,
  circumference,
  dashOffset,
}: Readonly<RingGeometry>) {
  const offset = useSettling(dashOffset);

  return (
    <AnimatedCircle
      cx={centre}
      cy={centre}
      r={radius}
      fill="none"
      stroke={fill}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={offset}
    />
  );
}

/** The fill of a <Progress> track, easing to `value` (0..1). `style` paints it
 *  and pins it to the track's left edge; the trailing inset is this component's. */
export function ProgressFill({ value, style }: Readonly<ProgressFillProps>) {
  const eased = useSettling(value);
  const trailing = eased.interpolate({ inputRange: [0, 1], outputRange: ['100%', '0%'] });

  return <Animated.View style={[style, { right: trailing } as unknown as ViewStyle]} />;
}
