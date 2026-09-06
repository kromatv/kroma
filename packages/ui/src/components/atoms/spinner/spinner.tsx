// The indeterminate busy ring: a rotating arc drawn with borders instead of SVG,
// so it costs one view and no per-frame path work. `useLoop` keeps the rotation
// off the JS thread on every platform.

import { Animated } from 'react-native';
import { sharedStyle, styles } from '#ui/core';
import { a11yState } from '#ui/lib/a11y';
import { useLoop } from '#ui/lib/loop';

interface SpinnerProps {
  size?: number;
  /** Defaults to a tenth of the size, floored at 2. */
  thickness?: number;
  /** A token name (`accent`, `textMuted`, `tint/40`) or a colour. Defaults to
   *  the accent. */
  color?: string;
  /** What is being waited for. Leave it out inside a control that already says
   *  it is busy (a <Button loading>), where a second name is noise. */
  label?: string;
}

const SPIN_MS = 900;

// Three faint quadrants leave one visible arc: the spinner is the turn.
const s = styles({ ring: { radius: 'circle', borderColor: 'tint/14' } });

const turnOf = (size: number, arc: number, top: string) =>
  sharedStyle(`spinner:${size}:${arc}:${top}`, {
    w: size,
    h: size,
    borderWidth: arc,
    borderTopColor: top,
  });
function Spinner({ size = 28, thickness, color, label }: Readonly<SpinnerProps>) {
  const spin = useLoop('spin', SPIN_MS);
  const arc = thickness ?? Math.max(2, Math.round(size / 10));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      {...a11yState({ busy: true })}
      style={[s.ring, turnOf(size, arc, color ?? 'accent'), spin]}
    />
  );
}

export type { SpinnerProps };
export { Spinner };
