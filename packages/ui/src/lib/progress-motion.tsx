// How a determinate bar and ring reach a new value, native (Apple TV /
// Android TV / phone).
//
// The JS driver, unavoidably: neither a percentage inset nor an SVG dash offset
// is a native-driver property. See progress-motion.web.tsx for the browser half,
// which spells both as CSS transitions.

import { useEffect, useRef, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import type { RingGeometry } from '#ui/lib/ring';
import { Circle } from '#ui/lib/svg';

interface ProgressArcProps extends RingGeometry {
  eased: boolean;
}

export interface ProgressFillProps {
  value: number;
  style: StyleProp<ViewStyle>;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function useSettling(to: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(to));
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

/** The arc of a <ProgressRing>, easing to a new length when the value changes
 *  unless `eased` is off. */
export function ProgressArc({ eased, ...arc }: Readonly<ProgressArcProps>) {
  if (!eased) return <Circle {...arcShape(arc)} strokeDashoffset={arc.dashOffset} />;
  return <SettlingArc {...arc} />;
}

function SettlingArc(arc: Readonly<RingGeometry>) {
  const offset = useSettling(arc.dashOffset);

  return <AnimatedCircle {...arcShape(arc)} strokeDashoffset={offset} />;
}

function arcShape({ centre, radius, thickness, fill, circumference }: Readonly<RingGeometry>) {
  return {
    cx: centre,
    cy: centre,
    r: radius,
    fill: 'none',
    stroke: fill,
    strokeWidth: thickness,
    strokeLinecap: 'round' as const,
    strokeDasharray: circumference,
  };
}

/** The fill of a <Progress> track, easing to `value` (0..1). `style` paints it
 *  and pins it to the track's left edge; the trailing inset is this component's. */
export function ProgressFill({ value, style }: Readonly<ProgressFillProps>) {
  const eased = useSettling(value);
  const trailing = eased.interpolate({ inputRange: [0, 1], outputRange: ['100%', '0%'] });

  return <Animated.View style={[style, { right: trailing } as unknown as ViewStyle]} />;
}
