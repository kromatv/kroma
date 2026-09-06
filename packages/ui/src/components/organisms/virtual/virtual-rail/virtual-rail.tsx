// <VirtualRail>: the horizontally scrolling row of the browse screens.
//
// Under a pointer or a finger the row is a REAL horizontal scroller and the
// platform owns every gesture: a vertical wheel chains to the page with its
// momentum intact, a sideways swipe or shift+wheel pans the row. Only under a
// D-pad, where no wheel exists, is the row translated by hand.
//
// A tile registers with the navigator wherever the row puts it and declares no
// slot of its own, so a tile mounting at the head of a sliding window would
// register LAST and walking left would die at the window's edge. The row
// therefore GROWS and never shrinks: tiles are mounted from the start of the
// data up to the furthest the selection has reached.

import { NavigatorView } from '@kroma/spatial-nav/react';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { clipStyles, OVERSCAN } from '#ui/components/organisms/virtual/clip';
import { MovingStrip } from '#ui/components/organisms/virtual/moving-strip';
import { sharedStyle, styles } from '#ui/core';
import { FocusLiftView } from '#ui/lib/focus-lift';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusReporter } from '#ui/lib/focus-report';
import { WEB } from '#ui/lib/platform';
import { useStableCallback } from '#ui/lib/stable-callback';
import { edgeScrollOffset, fitPitch, horizontalInset, maxOffset } from './edge-scroll';
import { edgeWidth, RailEdge } from './rail-edge';
import { KEY_GRACE_MS, useKeyGrace } from './use-key-grace';

const TOUCH = !WEB && !Platform.isTV;

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
  arrows?: boolean;
}

const rangeOf = (minWidth: number) => sharedStyle(`virtual-rail:range:${minWidth}`, { minWidth });
function VirtualRail<T>({
  data,
  itemWidth,
  renderItem,
  gap = 0,
  style,
  contentStyle,
  onEndReached,
  edgeMargin = 1,
  arrows = true,
}: Readonly<VirtualRailProps<T>>) {
  // Without a <FocusScope> above there is no navigator. Unscoped, the row keeps
  // everything except the D-pad.
  const scoped = useInsideFocusScope();
  // Translated only where the D-pad drives the row; everywhere else the row is
  // a real scroller.
  const translated = scoped;
  const scroller = useRef<ScrollView | null>(null);
  const [offset, setOffset] = useState(0);
  const [reach, setReach] = useState(OVERSCAN);
  const [hovered, setHovered] = useState(false);

  // The offset is state (the fades render from it) and a ref (a scroll event
  // delivers faster than React commits).
  const at = useRef(0);
  const measured = useRef(0);
  const keyAt = useKeyGrace(scoped);

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

  // Stable, so the tiles never rebuild when the row grows: one function,
  // always seeing the current pitch and count. Not `useEffectEvent`, whose new
  // closure per render moves every tile's `onFocus` and rebuilds the row.
  const select = useStableCallback((index: number) => {
    grow(index + OVERSCAN);
    if (index >= count - 1 - OVERSCAN) onEndReached?.();
    // A real scroller owns its position: the browser reveals a tab-focused
    // tile itself, and a tap must not yank the row out from under the finger.
    if (!translated) return;
    // Only a PRESS moves the row: the navigator focuses whatever the cursor
    // enters, so scrolling on every focus change made the row creep sideways
    // under a wandering pointer.
    if (WEB && Date.now() - keyAt.current > KEY_GRACE_MS) return;
    at.current = edgeScrollOffset({
      offset: at.current,
      index,
      itemSize: pitch,
      viewport: measured.current,
      count,
      margin: edgeMargin * pitch,
    });
    setOffset(at.current);
  });

  const onRailScroll = useCallback(
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
    (direction: 1 | -1) => {
      const by = direction * Math.max(pitch, measured.current - pitch);
      const furthest = maxOffset(count, pitch, measured.current);
      const target = Math.round(Math.min(furthest, Math.max(0, at.current + by)));
      // Mounted before the move, or the scroll runs into an unrendered gap.
      grow(Math.ceil((target + measured.current) / pitch) + OVERSCAN);
      if (translated) {
        at.current = target;
        setOffset(target);
        return;
      }
      scroller.current?.scrollTo({ x: target, animated: true });
    },
    [count, grow, pitch, translated],
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
    scroller.current?.scrollTo({ x: snapped, animated: false });
  }, [pitch, count]);

  const mounted = Math.min(count, reach + 1);
  // Every cell is the same box, so it is the same OBJECT: the tiles rebuild on
  // every pan, and a fresh style per tile is a styleq cache miss on each of them.
  const cell = sharedStyle(`virtual-rail:cell:${pitch}:${gap}`, {
    width: pitch,
    paddingHorizontal: gap / 2,
  });
  const tiles: ReactElement[] = [];
  for (let next = 0; next < mounted; next += 1) {
    const index = next;
    const item = data[index];
    if (item === undefined) continue;
    tiles.push(
      // <FocusReporter> rather than a node per tile: the tile's own focusable
      // is already the node, and the row only needs to know which one took it.
      <FocusLiftView key={index} style={cell}>
        <FocusReporter onFocus={() => select(index)}>{renderItem(item, index)}</FocusReporter>
      </FocusLiftView>,
    );
  }

  const furthest = maxOffset(count, pitch, width);
  const arrowsOn = WEB && arrows;
  // The fade means "there is more": always on a D-pad row, with the buttons under
  // a pointer, never on touch.
  const buttonsUp = arrowsOn && hovered;
  const fadeOn = scoped || buttonsUp;
  const fadeStart = fadeOn && offset > 1;
  const fadeEnd = fadeOn && offset < furthest - 1;

  const row = scoped ? (
    <NavigatorView direction="horizontal">{tiles}</NavigatorView>
  ) : (
    <View style={s.row}>{tiles}</View>
  );

  return (
    <View
      style={style}
      onLayout={onLayout}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {translated ? (
        <View style={clipStyles.clip}>
          <MovingStrip axis="x" offset={offset} style={contentStyle}>
            {row}
          </MovingStrip>
        </View>
      ) : (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onRailScroll}
          scrollEventThrottle={16}
          // The full row's width from the first frame: the scroll RANGE must not
          // grow with the mounted window, or a hard fling bounces off its end.
          contentContainerStyle={[s.row, contentStyle, rangeOf(count * pitch)]}
        >
          {row}
        </ScrollView>
      )}
      {/* Mounted whether shown or not, so the control fades rather than appears. */}
      {arrowsOn || (scoped && !TOUCH) ? (
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

const s = styles({
  row: { row: true, align: 'center' },
});

export type { VirtualRailProps };
export { VirtualRail };
