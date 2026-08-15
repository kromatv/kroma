// The ends of the rail: the fade signalling more content, plus the pointer's
// paging control. Web uses a CSS mask on the clip box (`railMask`); React
// Native has no `maskImage`, so native paints a scrim instead (same geometry,
// same samples), sized to the row's own height so it doesn't wash out the title.

import { useEffect, useState } from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';
import { Icon } from '#ui/components/atoms/icon';
import { FOCUS_BLEED } from '#ui/components/organisms/virtual/clip';
import { styles } from '#ui/core';
import { SHADE, shade } from '#ui/core/tokens';
import { gradient } from '#ui/lib/css';
import { WEB } from '#ui/lib/platform';
import { EASE_NATIVE, FADE, SETTLE_MS } from './rail-motion';

const EDGE_SHARE = 0.15;
const EDGE_MIN = 88;
const EDGE_MAX = 300;
const EDGE_INSET = 8;

/** Fade length scales with row width, clamped to EDGE_MIN..EDGE_MAX so it reads
 *  correctly at both TV and narrow (e.g. workbench) widths. */
export function edgeWidth(row: number): number {
  if (row <= 0) return EDGE_MIN;
  return Math.round(Math.min(EDGE_MAX, Math.max(EDGE_MIN, row * EDGE_SHARE)));
}

// Smootherstep curve, sampled as stops: masks and gradients only interpolate
// linearly between them, so the curve has to be drawn rather than described.
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

function fadeIn(alpha: number, t: number, fade: number): string {
  return `rgba(0, 0, 0, ${alpha}) ${Math.round(FOCUS_BLEED + t * fade)}px`;
}

/** CSS mask-image for the row's clip box (web). An end that cannot scroll is
 *  left unfaded rather than transitioned, since mask images can't interpolate -
 *  the first tile's focus ring lives in the bleed and fading it would shave it. */
export function railMask(fade: number, start: boolean, end: boolean): string {
  const stops: string[] = [];
  if (start) {
    // Flat from the clip edge to the row edge, then the curve.
    stops.push('rgba(0, 0, 0, 0) 0px');
    for (const [t, alpha] of FADE_CURVE) stops.push(fadeIn(alpha, t, fade));
  } else stops.push('rgba(0, 0, 0, 1) 0px');
  if (end) {
    // Mirrored curve from the far edge, in calc() since the row's width isn't known here.
    for (let at = FADE_CURVE.length - 1; at >= 0; at--) {
      const [t, alpha] = FADE_CURVE[at] ?? [0, 0];
      stops.push(`rgba(0, 0, 0, ${alpha}) calc(100% - ${Math.round(FOCUS_BLEED + t * fade)}px)`);
    }
    stops.push('rgba(0, 0, 0, 0) 100%');
  } else stops.push('rgba(0, 0, 0, 1) 100%');
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function scrim(start: boolean, fade: number): string {
  const stops = FADE_CURVE.map(
    ([t, visible]) =>
      `${shade(Number((1 - visible).toFixed(2)))} ${Math.round(FOCUS_BLEED + t * fade)}px`,
  );
  return `linear-gradient(to ${start ? 'right' : 'left'}, ${SHADE.full} 0px, ${stops.join(', ')})`;
}

// `RailEdge` isn't memoised and mounts twice, so recomputing on every D-pad
// scroll would remap the curve needlessly.
const scrims = new Map<string, ViewStyle>();

function scrimStyle(start: boolean, fade: number): ViewStyle {
  const key = `${start}:${fade}`;
  const hit = scrims.get(key);
  if (hit) return hit;
  const style = gradient(scrim(start, fade)) as ViewStyle;
  scrims.set(key, style);
  return style;
}

/** One end of the row: the paging control, plus (native D-pad rows) the fade
 *  behind it. Uses a plain `Pressable`, not `<Focusable>`, so the arrow is
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
  const start = side === 'start';
  // CSS transitions (`FADE`) are silently ignored on native and the gradient
  // blinks instead of fading; drive it through Animated there.
  const [fade] = useState(() => new Animated.Value(shown ? 1 : 0));
  useEffect(() => {
    if (WEB) return;
    Animated.timing(fade, {
      toValue: shown ? 1 : 0,
      duration: SETTLE_MS,
      easing: EASE_NATIVE,
      useNativeDriver: true,
    }).start();
  }, [shown, fade]);
  return (
    <Animated.View
      style={[
        s.edge,
        shown && arrow ? s.passThrough : s.inert,
        { width: width + FOCUS_BLEED },
        start ? s.edgeStart : s.edgeEnd,
        // Web already masked the edge away; painting a scrim here would recreate
        // the artefact the mask avoids.
        WEB ? null : scrimStyle(start, width),
        WEB ? ({ opacity: shown ? 1 : 0 } as ViewStyle) : { opacity: fade },
        WEB ? (FADE as ViewStyle) : null,
      ]}
    >
      <Pressable
        focusable={false}
        accessibilityRole="button"
        accessibilityLabel={start ? 'Scroll left' : 'Scroll right'}
        onPress={onPress}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          s.arrow,
          { opacity: arrow ? 1 : 0 } as ViewStyle,
          FADE as ViewStyle,
          hovered ? s.arrowHover : null,
          pressed ? s.arrowPressed : null,
        ]}
      >
        <Icon name={start ? 'chevron-left' : 'chevron-right'} size={24} color="text" />
      </Pressable>
    </Animated.View>
  );
}

const s = styles({
  // Sized to the row's own height, not the clip's, so a native scrim doesn't
  // bleed into the title above the rail.
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
    shadow: 'card',
  },
  arrowHover: { bg: 'tint/20' },
  arrowPressed: { bg: 'tint/28', transform: [{ scale: 0.94 }] },
});
