// <ProgressRing>: a thin circular progress arc (0..1), starting at 12 o'clock
// and filling clockwise. Used where a bar would not fit (the AI-suggestions rail
// while the server is still generating it). The arc eases to a new value;
// `indeterminate` spins a fixed arc instead and ignores `value`.

import { Animated, View } from 'react-native';
import { style } from '#ui/core';
import { useLoop } from '#ui/lib/loop';
import { ProgressArc } from '#ui/lib/progress-motion';
import {
  RING_BUSY_ARC,
  RING_ROTATION,
  RING_SPIN_MS,
  type RingProps,
  ringGeometry,
} from '#ui/lib/ring';
import { Circle, Svg } from '#ui/lib/svg';

interface ProgressRingProps extends RingProps {
  indeterminate?: boolean;
}

// SVG draws an arc from 3 o'clock; rotating the container starts it at 12. The
// rotation lives on a View rather than on the <svg> so it is expressed once, in
// React Native's transform vocabulary, on both platforms.
const startAtTwelve = style({ transform: [{ rotate: RING_ROTATION }] });

function ProgressRing({ indeterminate = false, ...props }: Readonly<ProgressRingProps>) {
  const g = ringGeometry(indeterminate ? { ...props, value: RING_BUSY_ARC } : props);
  const spin = useLoop('spin', RING_SPIN_MS, indeterminate);

  const ring = (
    <View style={startAtTwelve}>
      <Svg width={g.size} height={g.size} viewBox={`0 0 ${g.size} ${g.size}`}>
        <Circle
          cx={g.centre}
          cy={g.centre}
          r={g.radius}
          fill="none"
          stroke={g.track}
          strokeWidth={g.thickness}
        />
        <ProgressArc {...g} />
      </Svg>
    </View>
  );

  if (!indeterminate) return ring;
  return <Animated.View style={spin}>{ring}</Animated.View>;
}

export type { ProgressRingProps };
export { ProgressRing };
