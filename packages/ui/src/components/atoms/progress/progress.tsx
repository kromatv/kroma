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
  /** 0..1 of the track already loaded, drawn as a dimmer fill under `value`. A
   *  range trailing `value` is held at `value`: nothing plays before it loads. */
  buffered?: number;
  /** In px. The design uses 6 on a rail tile. */
  thickness?: number;
  color?: ColorValue;
  trackColor?: ColorValue;
  /** Round the ends into a pill. Pass `false` for the flush bar pinned to a
   *  tile's bottom edge. */
  rounded?: boolean;
  indeterminate?: boolean;
  /** Breathe the track ahead of the fill: the bar is stalled on data and still
   *  reports where it stands. Ignored under `indeterminate`, which has no
   *  position to keep. */
  waiting?: boolean;
  /** Names the bar to assistive tech. Leave it out inside a control that
   *  already carries the name (a rail tile's resume bar). */
  label?: string;
}

const SWEEP_MS = motion.duration.slow * 3;
const BREATH_MS = motion.duration.slow * 3;

const BUFFERED_OPACITY = 0.32;
const WAITING_OPACITY = 0.22;

const FULL_WIDTH = { right: 0 } as const;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}

function Progress({
  value = 0,
  buffered,
  thickness = 6,
  color = 'accent',
  trackColor = 'tint/25',
  rounded = true,
  indeterminate = false,
  waiting = false,
  label,
}: Readonly<ProgressProps>) {
  const breathing = waiting && !indeterminate;
  const sweep = useLoop('sweep', SWEEP_MS, indeterminate);
  const breath = useLoop('pulse', BREATH_MS, breathing);
  const corner = rounded ? 'pill' : 0;
  const position = clamp01(value);
  const bar = layerStyle(color, corner);

  return (
    <Box
      h={thickness}
      self="stretch"
      bg={trackColor}
      radius={corner}
      overflow="hidden"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      {...(indeterminate ? {} : a11yValue({ min: 0, max: 100, now: Math.round(position * 100) }))}
      {...(indeterminate || breathing ? a11yState({ busy: true }) : {})}
    >
      {buffered === undefined ? null : (
        <ProgressFill
          value={Math.max(clamp01(buffered), position)}
          style={layerStyle(color, corner, BUFFERED_OPACITY)}
        />
      )}
      {breathing ? (
        <Box fill opacity={WAITING_OPACITY}>
          <Animated.View style={[bar, FULL_WIDTH, breath]} />
        </Box>
      ) : null}
      {indeterminate ? (
        <Animated.View style={[bar, sweep]} />
      ) : (
        <ProgressFill value={position} style={bar} />
      )}
    </Box>
  );
}

export type { ProgressProps };
export { clamp01, Progress };

// Shared by identity across every bar asking for the same paint: styleq keys its
// compiled-style cache on the leaf object, so resolving one per render is a
// guaranteed miss for every bar on a browse grid.
function layerStyle(color: ColorValue, corner: 'pill' | 0, opacity = 1) {
  return sharedStyle(`bar:${color}:${corner}:${opacity}`, {
    absolute: true,
    top: 0,
    bottom: 0,
    left: 0,
    bg: color,
    radius: corner,
    opacity,
  });
}
