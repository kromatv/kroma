import { Animated } from 'react-native';
import { useLoop } from '#ui/lib/loop.hook';
import { Path, Svg } from '#ui/lib/svg.component';
import {
  KROMA_WHEEL_COLORS,
  KROMA_WHEEL_SEGMENTS,
  WHEEL_SPIN_MS,
  WHEEL_VIEWBOX,
  type WheelSpin,
} from '#ui/lib/wheel-paths';

interface WheelProps {
  /** Wheel diameter. */
  size?: number;
  spin?: WheelSpin;
}

/** The KROMA chromatic wheel, on every target. */
function Wheel({ size = 24, spin }: Readonly<WheelProps>) {
  // A native-driven transform on a television, a CSS keyframe in a browser, and
  // never `fill: both`, which leaves the wheel stranded mid-turn in an occluded
  // window.
  // `idle` is the resting speed, so an unspun wheel still has to name a duration
  // for the hook; `active` is what actually decides whether anything turns.
  const rotation = useLoop('spin', WHEEL_SPIN_MS[spin ?? 'idle'], Boolean(spin));

  const svg = (
    <Svg width={size} height={size} viewBox={WHEEL_VIEWBOX}>
      {KROMA_WHEEL_SEGMENTS.map((d, i) => (
        <Path key={d} d={d} fill={KROMA_WHEEL_COLORS[i]} />
      ))}
    </Svg>
  );

  if (!spin) {
    return svg;
  }
  return <Animated.View style={rotation}>{svg}</Animated.View>;
}

export type { WheelProps };
export { Wheel };
