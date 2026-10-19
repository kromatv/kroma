import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';

// The ends of the rail: the fade signalling more content, plus the pointer's
// paging control. A CSS mask over the row would fade to whatever is behind it,
// but a masked ancestor forms a BACKDROP ROOT and every <Frost> beneath it goes
// blind (see lib/css.web.ts); React Native has no `maskImage` at all.

import { Pressable, type ViewStyle } from 'react-native';
import { Icon } from '#ui/components/atoms/icon';
import { FOCUS_BLEED } from '#ui/components/organisms/virtual/clip';
import { FADE, SETTLE_MS } from '#ui/components/organisms/virtual/strip-motion';

import { useStyles } from '#ui/core/styles';
import { SHADE, shade } from '#ui/core/tokens';
import { gradient } from '#ui/lib/css';
import { ease } from '#ui/lib/ease';
import { GlideView } from '#ui/lib/glide-view';

const EDGE_SHARE = 0.15;
const EDGE_MIN = 88;
const EDGE_MAX = 300;
const EDGE_INSET = 8;

/** Fade length scales with row width, clamped to EDGE_MIN..EDGE_MAX so it reads
 *  correctly at both TV and narrow (e.g. workbench) widths. */

const widthOf = (width: number, scope: StyleScope) =>
  sharedStyle(`rail-edge:width:${width}`, { width }, scope);
export function edgeWidth(row: number): number {
  if (row <= 0) return EDGE_MIN;
  return Math.round(Math.min(EDGE_MAX, Math.max(EDGE_MIN, row * EDGE_SHARE)));
}

// Smootherstep curve, sampled as stops: a gradient only interpolates linearly
// between them, so the curve has to be drawn rather than described.
const FADE_CURVE = [
  [0, 0],
  [0.12, 0.01],
  [0.25, 0.1],
  [0.4, 0.32],
  [0.55, 0.59],
  [0.7, 0.84],
  [0.85, 0.97],
  [1, 1],
] as const;

function scrim(start: boolean, fade: number): string {
  const stops = FADE_CURVE.map(
    ([t, visible]) =>
      `${shade(Number((1 - visible).toFixed(2)))} ${Math.round(FOCUS_BLEED + t * fade)}px`,
  );
  return `linear-gradient(to ${start ? 'right' : 'left'}, ${SHADE.full} 0px, ${stops.join(', ')})`;
}

// `RailEdge` isn't memoised and mounts twice, so recomputing on every D-pad
// scroll would remap the curve needlessly.

function scrimStyle(start: boolean, fade: number, scope: StyleScope): ViewStyle {
  return sharedStyle(`rail-edge:scrim:${start}:${fade}`, gradient(scrim(start, fade)), scope);
}

/** One end of the row: the fade over the row's last tiles, plus the pointer's
 *  paging control. Uses a plain `Pressable`, not `<Focusable>`, so the arrow is
 *  never a stop in the D-pad's own path through the row. */
export function RailEdge({
  side,
  shown,
  arrow,
  onPress,
  width,
}: Readonly<{
  side: 'start' | 'end';
  shown: boolean;
  arrow: boolean;
  onPress: () => void;
  width: number;
}>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const start = side === 'start';
  return (
    <GlideView
      opacity={shown ? 1 : 0}
      ms={SETTLE_MS}
      easing={ease.out}
      style={[
        s.edge,
        shown && arrow ? s.passThrough : s.inert,
        widthOf(width + FOCUS_BLEED, scope),
        start ? s.edgeStart : s.edgeEnd,
        scrimStyle(start, width, scope),
      ]}
    >
      <Pressable
        // tabIndex, not `focusable`: react-native-web's <Pressable> reads only
        // the former, so `focusable={false}` leaves it in the browser tab order.
        tabIndex={-1}
        accessibilityRole="button"
        accessibilityLabel={start ? 'Scroll left' : 'Scroll right'}
        onPress={onPress}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          s.arrow,
          arrow ? s.shown : s.hidden,
          FADE,
          hovered ? s.arrowHover : null,
          pressed ? s.arrowPressed : null,
        ]}
      >
        <Icon name={start ? 'chevron-left' : 'chevron-right'} size={24} color="text" />
      </Pressable>
    </GlideView>
  );
}

const sDefinition = styles({
  shown: { opacity: 1 },
  hidden: { opacity: 0 },
  // Sized to the row's own height, not the clip's, so the scrim doesn't bleed
  // into the title above the rail.
  edge: { absolute: true, top: 0, bottom: 0, justify: 'center', z: 2 },
  passThrough: { pointerEvents: 'box-none' },
  inert: { pointerEvents: 'none' },
  // Pulled out by FOCUS_BLEED and padded back in, so the strip covers the clip
  // edge while the button stays on the row.
  edgeStart: { left: -FOCUS_BLEED, align: 'flex-start', pl: FOCUS_BLEED + EDGE_INSET },
  edgeEnd: { right: -FOCUS_BLEED, align: 'flex-end', pr: FOCUS_BLEED + EDGE_INSET },
  arrow: {
    w: 44,
    h: 44,
    radius: 'pill',
    center: true,
    bg: 'tint/12',
    border: 'borderStrong',
  },
  arrowHover: { bg: 'tint/20' },
  arrowPressed: { bg: 'tint/28', transform: [{ scale: 0.94 }] },
});
