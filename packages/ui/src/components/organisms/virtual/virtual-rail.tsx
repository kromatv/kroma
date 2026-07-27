// <VirtualRail>: the horizontally scrolling row of the browse screens.
//
// It owns three things, and each of them is owned for a measured reason.
//
// THE MOTION. On the browser targets the row moves with a CSS transition, not
// with `Animated`. react-native-web has no native animated module - it says so
// out loud, "useNativeDriver is not supported ... falling back to JS-based
// animation" - so every Animated value is a requestAnimationFrame loop writing
// an inline style each frame, competing with React for the same main thread.
// Two of those (this row's and the navigator library's) is what "laggy" was. A
// transition hands the whole thing to the compositor: one style write, zero JS
// per frame. Native keeps Animated, where the native driver is real. That is
// <MovingRow>, below.
//
// THE OFFSET. Where the row sits is a rule the library cannot express: the
// highlight travels across the middle and the row moves only when the selection
// comes within a margin of an end, which depends on where the row already is.
// That is `edge-scroll.ts`, tested on its own.
//
// THE WINDOW, and this is the constraint everything else bends around. LRUD
// orders siblings by REGISTRATION and `SpatialNavigationNode` cannot declare an
// index, so a tile that mounts at the head of a sliding window registers LAST
// and walking left dies at the window's edge (measured, twice, before this note
// existed). The row therefore GROWS and never shrinks: tiles are mounted from
// the start of the data up to the furthest the selection has reached, so every
// tile the D-pad can move to is one that was mounted in order. The cost is
// bounded by how far someone actually walks a row - a screenful to start with,
// and a rail is not a 2000-item grid. <VirtualGrid> keeps the library's
// virtualisation, where the window has to be a window.
//
// The ends of the row - the fades and the pointer's paging arrows - live in
// `rail-edge.tsx`.

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import { maskImage } from '#ui/lib/css';
import { webDocument } from '#ui/lib/dom';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusReporter } from '#ui/lib/focus-report';
import { useWheelPan } from '#ui/lib/wheel-pan';
import { clipStyles, OVERSCAN } from './clip';
import { edgeScrollOffset, fitPitch, horizontalInset, maxOffset } from './edge-scroll';
import { edgeWidth, RailEdge, railMask } from './rail-edge';
import { EASE_CSS, EASE_NATIVE, SETTLE_MS } from './rail-motion';

const WEB = Platform.OS === 'web';
/** A screen someone SCROLLS WITH A THUMB: the phones and the tablets, where the
 * row's other two inputs (a D-pad walking focus, a wheel under a pointer) do not
 * exist and the row would otherwise be frozen scenery. */
const TOUCH = !WEB && !Platform.isTV;

/** How long a press stays "the reason" for a focus change. Generous: the
 * navigator resolves the move, mounts what it needs and only then does the tile
 * report - all after the keydown, and all before a human presses again. */
const KEY_GRACE_MS = 400;

/** The keys that mean "move the selection", on every remote the shells see. */
const DIRECTIONS = new Set(['ArrowLeft', 'ArrowRight', 'Left', 'Right']);

/** How long after the last wheel tick the row answers the pointer again. Long
 * enough to cover the gap between ticks of one gesture, short enough that a
 * click straight after a scroll still lands. */
const PAN_SETTLE_MS = 180;

interface VirtualRailProps<T> {
  data: readonly T[];
  /** Tile pitch in pixels: the tile's own width PLUS the gap after it. It is a
   *  TARGET - the row fits a whole number of tiles into the width it is given,
   *  so a 10-foot pitch in a phone becomes three tiles rather than two and a
   *  sliced one. Tiles should therefore fill their cell (`width: '100%'`). */
  itemWidth: number;
  renderItem: (item: T, index: number) => ReactElement;
  /** The space BETWEEN tiles, as padding inside each pitch cell. It belongs here
   *  rather than in a wrapper the caller renders: the cell already exists, and a
   *  second view per tile purely to hold a padding doubles the mounted-control
   *  count - which is the number a television's frame time follows. */
  gap?: number;
  /** The row's own box on the page: the viewport that clips. Needs a height. */
  style?: ViewStyle;
  /** Padding around the tiles, applied to the row that moves. */
  contentStyle?: ViewStyle;
  /** Fetch the next page. Fires a couple of tiles before the end. */
  onEndReached?: () => void;
  /**
   * Look-ahead kept past the selection, in TILES, before the row starts moving.
   * One reads best: there is always a tile visible beyond the highlight, so the
   * row shows where you are about to go. Zero means "move only once the
   * selection is flush against the edge".
   */
  edgeMargin?: number;
  /** Let a mouse wheel / trackpad pan the row (web). It never moves the
   *  selection - see `wheel-pan.web.ts`. */
  wheel?: boolean;
  /** Show the pointer's own way to page the row: an arrow at each end, on hover.
   *  Web only, and never a focus stop - a remote already has two buttons for
   *  this, and an arrow it could land on would be one more thing in its way. */
  arrows?: boolean;
}

function VirtualRail<T>({
  data,
  itemWidth,
  renderItem,
  gap = 0,
  style,
  contentStyle,
  onEndReached,
  edgeMargin = 1,
  wheel = true,
  arrows = true,
}: Readonly<VirtualRailProps<T>>) {
  const viewport = useRef<View | null>(null);
  // No <FocusScope> above means no navigator, and the navigator's own view
  // THROWS when its root is missing. That is the correct outcome on a
  // television (a dead remote should be loud) and the wrong one on a phone or
  // a bare web page, which have no navigator on purpose - the same rule
  // <Focusable> follows. Unscoped, the row keeps everything except the D-pad:
  // the touch ScrollView, the wheel pan, the arrows, the fades, the window.
  const scoped = useInsideFocusScope();
  const [offset, setOffset] = useState(0);
  /** The furthest tile mounted. Grows with what has been REACHED - by the
   *  selection or by a pan - and never shrinks. */
  const [reach, setReach] = useState(OVERSCAN);
  /** A wheel pan tracks the gesture exactly: no transition while it runs. */
  const [panning, setPanning] = useState(false);
  /** The arrows are for the pointer, so they appear when the pointer does. */
  const [hovered, setHovered] = useState(false);

  // The offset is state (the transform renders from it) and a ref (a pan adds to
  // it between renders, and a wheel delivers faster than React commits).
  const at = useRef(0);
  const measured = useRef(0);
  /** When a direction key was last pressed. A focus change that does NOT follow
   *  one came from the cursor. */
  const keyAt = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  // Capture phase: react-native-web's TextInput stops propagation on keydown, so
  // a bubbling listener would miss every press made while a field holds focus.
  useEffect(() => {
    // `webDocument()` rather than the global: it is the one sanctioned way for
    // shared code to ask for the DOM, and it returns null on a television instead
    // of throwing a ReferenceError that React turns into a crash. See lib/dom.
    const dom = webDocument();
    if (!WEB || !dom) return;
    const onKey = (e: KeyboardEvent) => {
      if (DIRECTIONS.has(e.key)) keyAt.current = Date.now();
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, []);

  const count = data.length;
  /** How much of the row's width `contentStyle` spends on padding. The tiles get
   *  what is left, and that is the width the pitch has to divide. */
  const contentInset = useMemo(() => horizontalInset(contentStyle), [contentStyle]);
  /**
   * The row's own width, as state as well as a ref.
   *
   * The ref is for the callbacks, which need it synchronously; the state is what
   * makes the PITCH below a derivation rather than a copy.
   */
  const [width, setWidth] = useState(0);
  /**
   * Everything below counts in PITCHES, and the pitch is what fits: `fitPitch`
   * stretches the authored width so a whole number of tiles fills the row exactly.
   *
   * DERIVED, and that is a fix rather than a tidy-up. It used to be state written
   * only by `onLayout`, so it went stale the moment `itemWidth` changed without a
   * resize: the tiles redrew at the new width inside slots still sized by the old
   * pitch, and because the row's offset is counted in pitches while
   * `edgeScrollOffset` only nudges an offset that has fallen outside its margin
   * window, an off-grid offset was never corrected. Both ends kept a sliced tile
   * for the rest of the session.
   */
  const pitch = width > 0 ? fitPitch(itemWidth, width) : itemWidth;
  /** The edge fade, sized from the row. See `edgeWidth`. */
  const edge = edgeWidth(width);

  /** Mount up to `index`, and never fewer than before. */
  const grow = useCallback(
    (index: number) => setReach((prev) => (index > prev ? Math.min(count - 1, index) : prev)),
    [count],
  );

  /** A tile took the focus: the row moves only if the selection is coming within
   *  a margin of an end. */
  const select = useCallback(
    (index: number) => {
      setPanning(false);
      grow(index + OVERSCAN);
      if (index >= count - 1 - OVERSCAN) onEndReached?.();
      // Only a PRESS moves the row. The navigator focuses whatever the cursor
      // enters, so scrolling on every focus change meant the row crept sideways
      // whenever the pointer wandered near an end; a pointer user says where the
      // row goes with the arrows or the wheel. Keyed off the press rather than
      // off "the pointer moved recently", because the focus change can land
      // after any grace window you pick - and off nothing at all on the
      // televisions, where a remote is the only input there is.
      if (WEB && Date.now() - keyAt.current > KEY_GRACE_MS) return;
      // On a touchscreen the ScrollView owns the position outright: a tap that
      // focused a tile yanking the row underneath it is the drawer-thumb bug in
      // sideways clothing.
      if (TOUCH) return;
      at.current = edgeScrollOffset({
        offset: at.current,
        index,
        itemSize: pitch,
        viewport: measured.current,
        count,
        margin: edgeMargin * pitch,
      });
      setOffset(at.current);
    },
    [count, edgeMargin, grow, onEndReached, pitch],
  );
  // The tiles close over this rather than over `select`, so growing the row does
  // not rebuild every tile that was already in it.
  const selectRef = useRef(select);
  selectRef.current = select;

  /** The wheel pans the row and leaves the selection alone - but the row still
   *  has to grow, or a pan runs off the end of what is mounted into blank space.
   *  What a pan reveals is mounted, exactly as if the selection had gone there. */
  const panBy = useCallback(
    (delta: number, instant: boolean) => {
      const furthest = maxOffset(count, pitch, measured.current);
      at.current = Math.round(Math.min(furthest, Math.max(0, at.current + delta)));
      setOffset(at.current);
      grow(Math.ceil((at.current + measured.current) / pitch) + OVERSCAN);
      // The row stops answering the pointer while it moves under one: in pointer
      // mode the navigator focuses whatever the cursor ENTERS, and the cursor
      // does not have to move for that - the tiles move under it.
      setPanning(instant);
      clearTimeout(settle.current);
      settle.current = setTimeout(() => setPanning(false), PAN_SETTLE_MS);
    },
    [count, grow, pitch],
  );

  const pan = useCallback((delta: number) => panBy(delta, true), [panBy]);
  useWheelPan(viewport, pan, wheel);

  /** The thumb's gesture, reported by the ScrollView that owns it on touch. The
   * row's own bookkeeping still has to happen - the reach grows so a fling never
   * runs into unmounted blank, the offset feeds the edge fades, and the end of
   * the row still asks for the next page. */
  const onTouchScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = Math.round(event.nativeEvent.contentOffset.x);
      at.current = x;
      setOffset(x);
      grow(Math.ceil((x + measured.current) / pitch) + OVERSCAN);
      if (x >= maxOffset(count, pitch, measured.current) - OVERSCAN * pitch) onEndReached?.();
    },
    [count, grow, onEndReached, pitch],
  );

  /** One arrow press moves a screenful less a tile, so the row overlaps itself
   *  by one and nothing is skipped over. In PITCHES, not `itemWidth`: the pitch
   *  is what a tile actually occupies, so paging by the authored width left the
   *  row a fraction of a tile out of step on every press. */
  const page = useCallback(
    (direction: 1 | -1) => panBy(direction * Math.max(pitch, measured.current - pitch), false),
    [panBy, pitch],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      // The CONTENT strip, not the view. `onLayout` measures the outer view, but
      // the tiles are laid out inside `contentStyle`'s horizontal padding - so
      // dividing the outer width into whole pitches put a whole row's worth of
      // tiles into a strip that many pixels narrower, and every offset was left
      // half a padding out of step. A sliver of a tile at each end, at every
      // scroll position, for any `itemWidth`. The two numbers have to be the
      // same box.
      const next = Math.max(0, e.nativeEvent.layout.width - contentInset);
      measured.current = next;
      setWidth((prev) => (prev === next ? prev : next));
      // Mount enough to fill the row the moment it is measured.
      grow(Math.ceil(next / itemWidth) + OVERSCAN);
    },
    [grow, itemWidth, contentInset],
  );

  // A new pitch puts the row off its own grid, and nothing else will put it back:
  // `edgeScrollOffset` returns the offset unchanged while it is inside the margin
  // window, so an off-grid one survives every press. Snap it, clamped to the row.
  useEffect(() => {
    const furthest = maxOffset(count, pitch, measured.current);
    const snapped = Math.round(
      Math.min(furthest, Math.max(0, Math.round(at.current / pitch) * pitch)),
    );
    if (snapped === at.current) return;
    at.current = snapped;
    setOffset(snapped);
  }, [pitch, count]);

  const mounted = Math.min(count, reach + 1);
  /** Every tile's cell is the same box, so it is the same OBJECT: the tiles
   *  rebuild on every pan (`mounted` grows), and a fresh style per tile is a
   *  guaranteed styleq cache miss per tile on each of those. */
  const cell = useMemo(() => ({ width: pitch, paddingHorizontal: gap / 2 }), [pitch, gap]);
  const tiles = useMemo(() => {
    const out: ReactElement[] = [];
    for (let index = 0; index < mounted; index++) {
      const item = data[index];
      if (item === undefined) continue;
      out.push(
        // The tile's own <Focusable> reports through <FocusReporter>. It is the
        // only signal that fires in BOTH directions: the navigator's `onActive`
        // is monotone, so a row wired to that scrolls right and freezes going
        // left. Every tile occupies exactly one PITCH, whatever it draws inside
        // it - the offset maths counts in pitches, so a tile that took its own
        // width instead would drift a little further out of step on every step.
        <View key={index} style={cell}>
          <FocusReporter onFocus={() => selectRef.current(index)}>
            {renderItem(item, index)}
          </FocusReporter>
        </View>,
      );
    }
    return out;
  }, [data, mounted, cell, renderItem]);

  const furthest = maxOffset(count, pitch, measured.current);
  const arrowsOn = WEB && arrows;
  /** Which ends have something beyond them, and so are faded away. Three
   *  regimes, one per input: a D-pad row (scoped) fades whenever it is
   *  scrolled - the fade is its only "there is more" hint, and no button can
   *  ever appear to carry it. Under a pointer the fade comes and goes WITH the
   *  paging buttons. On touch it never shows: a thumb pages the row itself,
   *  and the fade was a slab of shade over the last posters. */
  const buttonsUp = arrowsOn && hovered;
  const fadeOn = scoped || buttonsUp;
  const fadeStart = fadeOn && offset > 1;
  const fadeEnd = fadeOn && offset < furthest - 1;
  /** A wheel gesture calls `setOffset` on every tick, and the mask is a dozen
   *  rounded template literals joined into a string wrapped in a fresh style
   *  object - so unmemoised it was rebuilt, and the clip box's CSS rewritten, on
   *  every frame of a pan. It depends on the row's width and two booleans. */
  const clip = useMemo(
    () => [clipStyles.clip, WEB ? maskImage(railMask(edge, fadeStart, fadeEnd)) : null],
    [edge, fadeStart, fadeEnd],
  );

  const row = scoped ? (
    <SpatialNavigationView direction="horizontal">{tiles}</SpatialNavigationView>
  ) : (
    <View style={styles.row}>{tiles}</View>
  );

  return (
    <View
      ref={viewport}
      style={style}
      onLayout={onLayout}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Three ways the row moves, one per input the platform actually has. On
          touch it is a real ScrollView - thumb physics cannot be imitated with a
          transition, and before this branch existed a swipe on a phone moved
          nothing at all. Elsewhere the row is translated: by the D-pad through
          the navigator on a television, by the wheel and the arrows on the web.
          The fade is a MASK on the clip box on the web and a painted scrim on
          a native D-pad row - when it shows at all; see `fadeOn`. */}
      {TOUCH ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onTouchScroll}
          scrollEventThrottle={32}
          // The full row's width from the first frame, tiles or no tiles: the
          // scroll RANGE must not grow with the mounted window, or a hard fling
          // bounces off the end of what happened to be mounted.
          contentContainerStyle={[styles.row, contentStyle, { minWidth: count * pitch }]}
        >
          {row}
        </ScrollView>
      ) : (
        <View style={clip}>
          <MovingRow offset={offset} instant={panning} style={contentStyle} interactive={!panning}>
            {row}
          </MovingRow>
        </View>
      )}
      {/* The edges exist where a pointer does (the paging buttons, with the
          fade framing them) and on a native D-pad row (the painted scrim - the
          web fades with a mask instead). They stay mounted so their control
          FADES rather than appears. A touch row mounts none: the fade never
          shows there. */}
      {arrowsOn || (scoped && !WEB && !TOUCH) ? (
        <>
          <RailEdge
            side="start"
            shown={fadeStart}
            arrow={buttonsUp}
            onPress={() => page(-1)}
            width={edge}
          />
          <RailEdge
            side="end"
            shown={fadeEnd}
            arrow={buttonsUp}
            onPress={() => page(1)}
            width={edge}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * The strip that moves, and the one place the two renderers differ.
 *
 * Web: a CSS transition on `transform`, so the browser animates it off the main
 * thread. Native: `Animated` with the real native driver. Same curve, same
 * duration, and in both cases exactly one style write per step.
 */
function MovingRow({
  offset,
  instant,
  interactive,
  style,
  children,
}: Readonly<{
  offset: number;
  instant: boolean;
  interactive: boolean;
  style?: ViewStyle;
  children: ReactElement;
}>) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (WEB) return;
    if (instant) {
      slide.setValue(-offset);
      return;
    }
    Animated.timing(slide, {
      toValue: -offset,
      duration: SETTLE_MS,
      easing: EASE_NATIVE,
      useNativeDriver: true,
    }).start();
  }, [instant, offset, slide]);

  const pointerEvents = interactive ? 'auto' : 'none';

  if (WEB) {
    return (
      <View
        pointerEvents={pointerEvents}
        style={[
          styles.row,
          style,
          {
            transform: [{ translateX: -offset }],
            // Typed loosely because these are CSS-only style props that
            // react-native-web understands and React Native's types do not.
            transitionProperty: 'transform',
            transitionDuration: `${instant ? 0 : SETTLE_MS}ms`,
            transitionTimingFunction: EASE_CSS,
          } as ViewStyle,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[styles.row, style, { transform: [{ translateX: slide }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

export type { VirtualRailProps };
export { VirtualRail };
