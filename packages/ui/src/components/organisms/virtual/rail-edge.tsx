// The ends of the rail: the fade that says "there is more", and the pointer's
// paging control that sits inside it.
//
// Two renderings of one geometry. On the web the fade is a MASK on the box that
// clips the row (`railMask`, applied by the rail): it removes the row's OWN
// pixels, so the tiles fade to whatever is actually behind them and nothing
// outside the clip box can be dimmed. A scrim - the page colour painted over the
// row - only disappears where the page is exactly that colour, and the strip
// reaches `FOCUS_BLEED` past the row on every side (it has to, or the end tiles'
// focus rings are shaved), so it also lay over the rail's title and washed the
// first word out. Native has no mask (see `maskImage`), so it keeps the painted
// scrim - same geometry, same samples - confined to the row's own height.

import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Icon } from '#ui/components/atoms/icon';
import { gradient } from '#ui/lib/css';
import { colors, radius, SHADE, shade, shadow } from '#ui/lib/tokens';
import { FOCUS_BLEED } from './clip';
import { EASE_NATIVE, FADE, SETTLE_MS } from './rail-motion';

/** A seventh of the row, and generous on purpose: an alpha ramp is only as soft
 *  as the distance it has to travel, and the short versions (5%, then 10%) both
 *  read as a band with an edge rather than as the row going quietly away. */
const EDGE_SHARE = 0.15;
const EDGE_MIN = 88;
const EDGE_MAX = 300;
/** How far the control sits from the row's very edge. */
const EDGE_INSET = 8;

/**
 * How long the fade at each end is, for a row of this width.
 *
 * PROPORTIONAL, and that is the fix. It was a constant 92, which is 5% of a
 * 1920pt television row and quite invisible - but the workbench's `fit` stage
 * clamps the story to 560, where the same 92 is 17% of the row and lands as a
 * black slab across a sixth of it. A fraction of the row instead, floored so it
 * never gets too thin to read as a fade and capped so a 4K row does not lose a
 * hand's width at each end.
 */
export function edgeWidth(row: number): number {
  if (row <= 0) return EDGE_MIN;
  return Math.round(Math.min(EDGE_MAX, Math.max(EDGE_MIN, row * EDGE_SHARE)));
}

/**
 * The shape of the fade: how VISIBLE the row is at each fraction of the fade's
 * length, from nothing at the outer edge to all of it inside.
 *
 * `smootherstep(t)`, sampled every eighth or so, and the samples are the whole
 * point - both a mask and a gradient interpolate LINEARLY between stops, so the
 * curve has to be drawn rather than described. Two stops of a straight ramp is
 * what "too sharp" was: it leaves the edge at its steepest, which the eye reads
 * as a boundary (it is far more sensitive to the first few percent of black than
 * to the last few) and which bands on a dark surface. A smootherstep leaves 0
 * flat and arrives at 1 flat, so there is nothing to see at either end - only in
 * the middle, where the row is already half gone and a fast change is invisible.
 */
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

/** A mask alpha at a distance from the START of the clip box. */
function fadeIn(alpha: number, t: number, fade: number): string {
  return `rgba(0, 0, 0, ${alpha}) ${Math.round(FOCUS_BLEED + t * fade)}px`;
}

/**
 * The row's ends, as a MASK on the box that clips it (web).
 *
 * The bleed is masked out entirely: what is painted there is a tile sliced by
 * the clip, which is the artefact all of this exists to hide. The fade proper
 * starts at the row's own edge, where the tiles do, and stops are in PIXELS so
 * the bleed is a prefix rather than a stretch of the curve.
 *
 * An end that cannot scroll is NOT faded - the first tile's focus ring lives in
 * that bleed, and fading it is how the ring got shaved before `FOCUS_BLEED`
 * existed. It switches rather than transitions (mask images do not interpolate),
 * which is invisible in practice: the switch happens on the frame the row starts
 * or stops moving.
 */
export function railMask(fade: number, start: boolean, end: boolean): string {
  const stops: string[] = [];
  if (start) {
    // Empty from the clip's edge to the row's, then the curve. The first sample
    // IS the row's edge, at zero, so the flat part needs one stop of its own.
    stops.push('rgba(0, 0, 0, 0) 0px');
    for (const [t, alpha] of FADE_CURVE) stops.push(fadeIn(alpha, t, fade));
  } else stops.push('rgba(0, 0, 0, 1) 0px');
  if (end) {
    // Mirrored: the same curve read from the far edge back, in `calc` so it does
    // not need the row's width - which this string is written without.
    for (let at = FADE_CURVE.length - 1; at >= 0; at--) {
      const [t, alpha] = FADE_CURVE[at] ?? [0, 0];
      stops.push(`rgba(0, 0, 0, ${alpha}) calc(100% - ${Math.round(FOCUS_BLEED + t * fade)}px)`);
    }
    stops.push('rgba(0, 0, 0, 0) 100%');
  } else stops.push('rgba(0, 0, 0, 1) 100%');
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** The same fade, painted, for native: opaque where the mask is empty, with the
 * ends of the curve swapped round. Same geometry, same samples. */
function scrim(start: boolean, fade: number): string {
  const stops = FADE_CURVE.map(
    ([t, visible]) =>
      `${shade(Number((1 - visible).toFixed(2)))} ${Math.round(FOCUS_BLEED + t * fade)}px`,
  );
  return `linear-gradient(to ${start ? 'right' : 'left'}, ${SHADE.full} 0px, ${stops.join(', ')})`;
}

/**
 * `gradient(scrim(...))` for a side and a fade length, built once.
 *
 * Native only, and the reason is the target: `RailEdge` is not memoised and is
 * mounted twice, so on a television every D-pad move that scrolls the row was
 * re-mapping the eight-sample curve and minting two style objects. The inputs
 * are a boolean and a width that only changes on resize, so the whole thing is a
 * two-entry lookup in practice.
 */
const scrims = new Map<string, ViewStyle>();

function scrimStyle(start: boolean, fade: number): ViewStyle {
  const key = `${start}:${fade}`;
  const hit = scrims.get(key);
  if (hit) return hit;
  const style = gradient(scrim(start, fade)) as ViewStyle;
  scrims.set(key, style);
  return style;
}

/** The browser targets resolve react-native to react-native-web. */
const WEB = Platform.OS === 'web';

/**
 * One end of the row: the pointer's page control, and on a native D-pad row the
 * fade behind it. A touch row mounts no edge at all (see the rail's `fadeOn`).
 *
 * The BUTTON is the kit's glass treatment at the size a pointer wants, centred
 * on the row rather than filling its height, because a full-height slab covers
 * artwork the viewer is trying to look at.
 *
 * It is a plain `Pressable`, deliberately: every other control in the kit is a
 * `<Focusable>` and therefore a node of the navigator, which is exactly what
 * this must not be. A remote pages the row by walking it; an arrow in that path
 * would be a stop the D-pad has to cross to reach the next tile.
 *
 * It fades rather than appears, and stays mounted while it can be used, so the
 * pointer never chases a control that pops into existence under it.
 */
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
  /** How long the FADE is, sized from the row - see `edgeWidth`. The strip is
   *  that plus the focus bleed, which is where the tiles are cut off. */
  width: number;
}>) {
  const start = side === 'start';
  // The strip's own appearance ANIMATES on native too. `FADE` is a CSS
  // transition, which only react-native-web understands - on a television the
  // style is silently ignored and the painted gradient BLINKED in the frame the
  // row started moving. Same value, same duration, through `Animated` where CSS
  // is not available.
  const fade = useRef(new Animated.Value(shown ? 1 : 0)).current;
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
      pointerEvents={shown && arrow ? 'box-none' : 'none'}
      style={[
        styles.edge,
        { width: width + FOCUS_BLEED },
        start ? styles.edgeStart : styles.edgeEnd,
        // Nothing is painted here on the web: the mask has already taken the
        // row's own edge away, and a gradient on top of that would be the slab
        // over the neighbouring content that the mask exists to stop being.
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
          styles.arrow,
          { opacity: arrow ? 1 : 0 } as ViewStyle,
          FADE as ViewStyle,
          hovered ? styles.arrowHover : null,
          pressed ? styles.arrowPressed : null,
        ]}
      >
        <Icon name={start ? 'chevron-left' : 'chevron-right'} size={24} color="text" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** The strip at one end of the row, holding the control - and on native the
   *  painted fade as well. Outside the clip box, so the button is never cut by
   *  it, and reaching as far out sideways as the clip does, so the native scrim
   *  covers the tile the clip cuts off in its own bleed instead of stopping just
   *  short of it.
   *
   *  The ROW's height, not the clip's: what a taller strip would cover is not
   *  the row, it is whatever sits above and below it - and 32px above a rail is
   *  its title, which the scrim duly washed out. The web has no such compromise
   *  to make, because a mask can only take away the row's own pixels. */
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  // The control sits AT the row's own edge, which is also where the tiles end:
  // the strip is pulled out by the bleed and padded back in by it, so it covers
  // the clip's edge while the button stays on the row. A hair of extra inset
  // keeps it off the very pixel.
  edgeStart: {
    left: -FOCUS_BLEED,
    alignItems: 'flex-start',
    paddingLeft: FOCUS_BLEED + EDGE_INSET,
  },
  edgeEnd: {
    right: -FOCUS_BLEED,
    alignItems: 'flex-end',
    paddingRight: FOCUS_BLEED + EDGE_INSET,
  },
  /** The kit's glass control: a translucent fill over a hairline, which reads on
   *  artwork of any brightness. */
  arrow: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    boxShadow: shadow.card,
  },
  arrowHover: { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  arrowPressed: { backgroundColor: 'rgba(255, 255, 255, 0.28)', transform: [{ scale: 0.94 }] },
});
