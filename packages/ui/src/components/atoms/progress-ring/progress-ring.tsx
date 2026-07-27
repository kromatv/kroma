// <ProgressRing>: a thin circular progress arc (0..1), starting at 12 o'clock
// and filling clockwise. Used where a bar would not fit (the AI-suggestions rail
// while the server is still generating it).

import { View } from 'react-native';
import { RING_ROTATION, type RingProps, ringGeometry } from '#ui/lib/ring';
import { Circle, Svg } from '#ui/lib/svg';

export type { RingProps as ProgressRingProps } from '#ui/lib/ring';

function ProgressRing(props: Readonly<RingProps>) {
  const g = ringGeometry(props);
  return (
    // SVG draws an arc from 3 o'clock; rotating the container starts it at 12.
    // The rotation lives on a View rather than on the <svg> so it is expressed
    // once, in React Native's transform vocabulary, on both platforms.
    <View style={{ transform: [{ rotate: RING_ROTATION }] }}>
      <Svg width={g.size} height={g.size} viewBox={`0 0 ${g.size} ${g.size}`}>
        <Circle
          cx={g.centre}
          cy={g.centre}
          r={g.radius}
          fill="none"
          stroke={g.track}
          strokeWidth={g.stroke}
        />
        <Circle
          cx={g.centre}
          cy={g.centre}
          r={g.radius}
          fill="none"
          stroke={g.fill}
          strokeWidth={g.stroke}
          strokeLinecap="round"
          strokeDasharray={g.circumference}
          strokeDashoffset={g.dashOffset}
        />
      </Svg>
    </View>
  );
}

export { ProgressRing };
