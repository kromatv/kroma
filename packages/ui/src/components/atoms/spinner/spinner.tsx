import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';

// The indeterminate busy ring: a rotating arc over a faint track, both drawn
// with borders instead of SVG, so it costs no per-frame path work. `useLoop`
// keeps the rotation off the JS thread on every platform.

import { Animated, View } from 'react-native';

import { useStyles } from '#ui/core/styles';
import { a11yState } from '#ui/lib/a11y';
import { useLoop } from '#ui/lib/loop';

interface SpinnerProps {
  size?: number;
  /** Defaults to a tenth of the size, floored at 2.5. */
  thickness?: number;
  /** A token name (`accent`, `textMuted`, `tint/40`) or a colour, for the arc
   *  and, faded, for the track under it. Defaults to the accent. */
  color?: string;
  /** What is being waited for. Leave it out inside a control that already says
   *  it is busy (a <Button loading>), where a second name is noise. */
  label?: string;
}

const SPIN_MS = 900;

const TRACK_OPACITY = 0.3;

const MIN_THICKNESS = 2.5;

const sDefinition = styles({
  track: { fill: true, radius: 'circle', opacity: TRACK_OPACITY },
  arc: {
    fill: true,
    radius: 'circle',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
});

const frameOf = (size: number, scope: StyleScope) =>
  sharedStyle(`spinner:${size}`, { w: size, h: size }, scope);

const trackOf = (arc: number, paint: string, scope: StyleScope) =>
  sharedStyle(`spinner-track:${arc}:${paint}`, { borderWidth: arc, borderColor: paint }, scope);

const arcOf = (arc: number, paint: string, scope: StyleScope) =>
  sharedStyle(
    `spinner-arc:${arc}:${paint}`,
    { borderWidth: arc, borderTopColor: paint, borderRightColor: paint },
    scope,
  );

function Spinner({ size = 28, thickness, color, label }: Readonly<SpinnerProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const spin = useLoop('spin', SPIN_MS);
  const arc = thickness ?? Math.max(MIN_THICKNESS, Math.round(size / 10));
  const paint = color ?? 'accent';

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      {...a11yState({ busy: true })}
      style={[frameOf(size, scope), spin]}
    >
      <View style={[s.track, trackOf(arc, paint, scope)]} />
      <View style={[s.arc, arcOf(arc, paint, scope)]} />
    </Animated.View>
  );
}

export type { SpinnerProps };
export { Spinner };
