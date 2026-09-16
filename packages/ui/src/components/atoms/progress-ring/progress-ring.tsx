// <ProgressRing>: a thin circular progress arc (0..1), starting at 12 o'clock
// and filling clockwise. Used where a bar would not fit (the AI-suggestions rail
// while the server is still generating it). The arc eases to a new value;
// `indeterminate` spins a fixed arc instead and ignores `value`.

import { Animated, View } from 'react-native';
import { clamp01 } from '#ui/components/atoms/progress';
import { style } from '#ui/core';
import { a11yState, a11yValue } from '#ui/lib/a11y';
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
  /** Names the ring to assistive tech. Leave it out inside a control that
   *  already carries the name. */
  label?: string;
}

// SVG draws an arc from 3 o'clock; rotating the container starts it at 12. The
// rotation lives on a View rather than on the <svg> so it is expressed once, in
// React Native's transform vocabulary, on both platforms.
const startAtTwelve = style({ transform: [{ rotate: RING_ROTATION }] });

function ProgressRing({ indeterminate = false, label, ...props }: Readonly<ProgressRingProps>) {
  const g = ringGeometry(indeterminate ? { ...props, value: RING_BUSY_ARC } : props);
  const spin = useLoop('spin', RING_SPIN_MS, indeterminate);
  const a11y = indeterminate
    ? a11yState({ busy: true })
    : a11yValue({ min: 0, max: 100, now: Math.round(clamp01(props.value ?? 0) * 100) });

  const ring = (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      {...a11y}
      style={startAtTwelve}
    >
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
