// <VirtualRail>: the horizontally scrolling row of the browse screens.
//
// LRUD orders siblings by REGISTRATION and `SpatialNavigationNode` cannot declare
// an index, so a tile mounting at the head of a sliding window registers LAST and
// walking left dies at the window's edge. The row therefore GROWS and never
// shrinks: tiles are mounted from the start of the data up to the furthest the
// selection has reached.

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
const TOUCH = !WEB && !Platform.isTV;

const KEY_GRACE_MS = 400;

const DIRECTIONS = new Set(['ArrowLeft', 'ArrowRight', 'Left', 'Right']);

const PAN_SETTLE_MS = 180;

interface VirtualRailProps<T> {
  data: readonly T[];
  /** Tile pitch in pixels: the tile's own width PLUS the gap after it, stretched
   *  so a whole number of tiles fills the row. Tiles fill their cell. */
  itemWidth: number;
  renderItem: (item: T, index: number) => ReactElement;
  gap?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  onEndReached?: () => void;
  /** Look-ahead kept past the selection, in TILES, before the row starts moving. */
  edgeMargin?: number;
  wheel?: boolean;
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
  // Without a <FocusScope> above there is no navigator, and its view THROWS on a
  // missing root. Unscoped, the row keeps everything except the D-pad.
  const scoped = useInsideFocusScope();
  const [offset, setOffset] = useState(0);
  const [reach, setReach] = useState(OVERSCAN);
  const [panning, setPanning] = useState(false);
  const [hovered, setHovered] = useState(false);

  // The offset is state (the transform renders from it) and a ref (a pan adds to
  // it between renders, and a wheel delivers faster than React commits).
  const at = useRef(0);
  const measured = useRef(0);
  const keyAt = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  // Capture phase: react-native-web's TextInput stops propagation on keydown, so
  // a bubbling listener would miss every press made while a field holds focus.
  useEffect(() => {
    const dom = webDocument();
    if (!WEB || !dom) return;
    const onKey = (e: KeyboardEvent) => {
      if (DIRECTIONS.has(e.key)) keyAt.current = Date.now();
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, []);

  const count = data.length;
  const contentInset = useMemo(() => horizontalInset(contentStyle), [contentStyle]);
  const [width, setWidth] = useState(0);
  // Everything below counts in PITCHES. Derived rather than state: a pitch cached
  // at layout goes stale when `itemWidth` changes without a resize, and an
  // off-grid offset is never corrected once it sits inside the margin window.
  const pitch = width > 0 ? fitPitch(itemWidth, width) : itemWidth;
  const edge = edgeWidth(width);

  const grow = useCallback(
    (index: number) => setReach((prev) => (index > prev ? Math.min(count - 1, index) : prev)),
    [count],
  );

  const select = useCallback(
    (index: number) => {
      setPanning(false);
      grow(index + OVERSCAN);
      if (index >= count - 1 - OVERSCAN) onEndReached?.();
      // Only a PRESS moves the row: the navigator focuses whatever the cursor
      // enters, so scrolling on every focus change made the row creep sideways
      // under a wandering pointer.
      if (WEB && Date.now() - keyAt.current > KEY_GRACE_MS) return;
      // On a touchscreen the ScrollView owns the position: a tap must not yank
      // the row out from under the finger.
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

  const panBy = useCallback(
    (delta: number, instant: boolean) => {
      const furthest = maxOffset(count, pitch, measured.current);
      at.current = Math.round(Math.min(furthest, Math.max(0, at.current + delta)));
      setOffset(at.current);
      grow(Math.ceil((at.current + measured.current) / pitch) + OVERSCAN);
      // The row stops answering the pointer while it moves under one: the
      // navigator focuses whatever the cursor ENTERS, and the tiles move under it
      // without the cursor moving at all.
      setPanning(instant);
      clearTimeout(settle.current);
      settle.current = setTimeout(() => setPanning(false), PAN_SETTLE_MS);
    },
    [count, grow, pitch],
  );

  const pan = useCallback((delta: number) => panBy(delta, true), [panBy]);
  useWheelPan(viewport, pan, wheel);

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

  // A screenful less a tile, so the row overlaps itself by one. In PITCHES:
  // paging by the authored width left the row a fraction of a tile out of step.
  const page = useCallback(
    (direction: 1 | -1) => panBy(direction * Math.max(pitch, measured.current - pitch), false),
    [panBy, pitch],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      // The CONTENT strip, not the outer view `onLayout` measures: the tiles are
      // laid out inside `contentStyle`'s horizontal padding, and the width the
      // pitch divides has to be the same box.
      const next = Math.max(0, e.nativeEvent.layout.width - contentInset);
      measured.current = next;
      setWidth((prev) => (prev === next ? prev : next));
      grow(Math.ceil(next / itemWidth) + OVERSCAN);
    },
    [grow, itemWidth, contentInset],
  );

  // A new pitch puts the row off its own grid, and nothing else will put it back:
  // `edgeScrollOffset` leaves an offset alone while it sits inside the margin.
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
  // Every cell is the same box, so it is the same OBJECT: the tiles rebuild on
  // every pan, and a fresh style per tile is a styleq cache miss on each of them.
  const cell = useMemo(() => ({ width: pitch, paddingHorizontal: gap / 2 }), [pitch, gap]);
  const tiles = useMemo(() => {
    const out: ReactElement[] = [];
    for (let index = 0; index < mounted; index++) {
      const item = data[index];
      if (item === undefined) continue;
      out.push(
        // <FocusReporter> is the only signal that fires in BOTH directions: the
        // navigator's `onActive` is monotone, so a row wired to that scrolls
        // right and freezes going left.
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
  // The fade means "there is more": always on a D-pad row, with the buttons under
  // a pointer, never on touch.
  const buttonsUp = arrowsOn && hovered;
  const fadeOn = scoped || buttonsUp;
  const fadeStart = fadeOn && offset > 1;
  const fadeEnd = fadeOn && offset < furthest - 1;
  // Memoised because a wheel gesture calls `setOffset` on every tick: unmemoised,
  // the mask string and the clip box's CSS were rebuilt on every frame of a pan.
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
      {/* Touch gets a real ScrollView: thumb physics cannot be imitated with a
          transition. Elsewhere the row is translated. */}
      {TOUCH ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onTouchScroll}
          scrollEventThrottle={32}
          // The full row's width from the first frame: the scroll RANGE must not
          // grow with the mounted window, or a hard fling bounces off its end.
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
      {/* Mounted whether shown or not, so the control fades rather than appears. */}
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

// Web: a CSS transition on `transform`, since react-native-web has no native
// driver and an Animated value there is a rAF loop competing with React for the
// main thread. Native: `Animated`, where the driver is real.
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
            // CSS-only props react-native-web understands and RN's types do not.
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
