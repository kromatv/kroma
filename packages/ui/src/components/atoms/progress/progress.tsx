// <Progress>: the determinate bar (resume position on a tile, download, import).
// The fill eases to a new value; `indeterminate` sweeps a segment across the
// track instead and ignores `value`.
// <ProgressRing>: its circular counterpart, used where a bar would not fit.

import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { type ColorValue, sharedStyle } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { a11yState, a11yValue } from '#ui/lib/a11y';
import { useLoop } from '#ui/lib/loop';
import { ProgressFill } from '#ui/lib/progress-motion';

interface ProgressProps {
  /** 0..1. Values outside the range are clamped, so a caller can pass a raw
   *  ratio without guarding against a stale duration of 0. */
  value?: number;
  /** In px. The design uses 6 on a rail tile. */
  thickness?: number;
  color?: ColorValue;
  trackColor?: ColorValue;
  /** Round the ends. Off for the flush bar pinned to a tile's bottom edge. */
  rounded?: boolean;
  indeterminate?: boolean;
  /** Names the bar to assistive tech. Leave it out inside a control that
   *  already carries the name (a rail tile's resume bar). */
  label?: string;
}

const SWEEP_MS = motion.duration.slow * 3;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}

function Progress({
  value = 0,
  thickness = 6,
  color = 'accent',
  trackColor = 'tint/25',
  rounded = false,
  indeterminate = false,
  label,
}: Readonly<ProgressProps>) {
  const sweep = useLoop('sweep', SWEEP_MS, indeterminate);
  const corner = rounded ? 'circle' : 0;
  // Pinned to the track's left edge and left open on the right, which is where
  // both the fill's inset and the sweep's travel land.
  const bar = barStyle(color, corner);

  return (
    <Box
      h={thickness}
      self="stretch"
      bg={trackColor}
      radius={corner}
      overflow="hidden"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      // An indeterminate bar has no value to announce, so it announces that it
      // is working instead.
      {...(indeterminate
        ? a11yState({ busy: true })
        : a11yValue({ min: 0, max: 100, now: Math.round(clamp01(value) * 100) }))}
    >
      {indeterminate ? (
        <Animated.View style={[bar, sweep]} />
      ) : (
        <ProgressFill value={clamp01(value)} style={bar} />
      )}
    </Box>
  );
}

export type { ProgressProps };
export { clamp01, Progress };

// Shared by identity across every bar asking for the same paint: styleq keys its
// compiled-style cache on the leaf object, so resolving one per render is a
// guaranteed miss for every bar on a browse grid.
function barStyle(color: ColorValue, corner: 'circle' | 0) {
  return sharedStyle(`bar:${color}:${corner}`, {
    absolute: true,
    top: 0,
    bottom: 0,
    left: 0,
    bg: color,
    radius: corner,
  });
}
