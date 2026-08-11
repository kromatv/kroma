// The indeterminate busy ring: a rotating arc drawn with borders instead of SVG,
// so it costs one view and no per-frame path work. `useLoop` keeps the rotation
// off the JS thread on every platform.

import { Animated } from 'react-native';
import { color as ink, radiusValue, useTheme } from '#ui/core';
import { useLoop } from '#ui/lib/loop';

interface SpinnerProps {
  size?: number;
  thickness?: number;
  /** A token name (`accent`, `textMuted`, `tint/40`) or a colour. Defaults to
   *  the accent. */
  color?: string;
}

const SPIN_MS = 900;

function Spinner({
  size = 28,
  thickness = Math.max(2, Math.round(size / 10)),
  color,
}: Readonly<SpinnerProps>) {
  const theme = useTheme();
  const spin = useLoop('spin', SPIN_MS);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[
        {
          width: size,
          height: size,
          borderRadius: radiusValue('circle'),
          borderWidth: thickness,
          // Three faint quadrants leave one visible arc: the spinner is the turn.
          borderColor: ink('tint/14'),
          borderTopColor: color ? ink(color) : theme.colors.accent,
        },
        spin,
      ]}
    />
  );
}

export type { SpinnerProps };
export { Spinner };
