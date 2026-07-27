// <Spinner>: the indeterminate busy ring.
//
// A rotating arc drawn with borders instead of SVG, so it costs one view and no
// per-frame path work. The rotation comes from `useLoop`, which is a
// native-driven transform on a television and a CSS keyframe in a browser -
// never a per-frame JS callback, which is what this component used to be on
// Tizen and webOS for as long as the player was buffering (lib/loop.web.ts).

import { Animated } from 'react-native';
import { useLoop } from '#ui/lib/loop';
import { colors, radius } from '#ui/lib/tokens';

interface SpinnerProps {
  size?: number;
  /** Ring thickness. Scales with the size by default. */
  thickness?: number;
  color?: string;
}

/** One turn. */
const SPIN_MS = 900;

function Spinner({
  size = 28,
  thickness = Math.max(2, Math.round(size / 10)),
  color = colors.accent,
}: Readonly<SpinnerProps>) {
  const spin = useLoop('spin', SPIN_MS);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          borderWidth: thickness,
          // Three transparent quadrants leave a single visible arc, which reads
          // as a spinner the moment it turns.
          borderColor: 'rgba(255, 255, 255, 0.14)',
          borderTopColor: color,
        },
        spin,
      ]}
    />
  );
}

export type { SpinnerProps };
export { Spinner };
