// <FocusScroll> and <FocusSlot>: the page, scrolled by the focus, one ROW at a
// time. A control that is in no row is its own row.

import { NavigatorNode } from '@kromatv/spatial-nav/react';
import {
  type Context,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { RING_ROOM } from '#ui/core/tokens';
import { FocusLiftView } from '#ui/lib/focus-lift';
import { useFrostGlide } from '#ui/lib/gl-frost/context';
import { usePointerDriving } from '#ui/lib/input-source';
import { WEB } from '#ui/lib/platform';
import { useReducedMotion } from '#ui/lib/reduced-motion';
import { ScrolledReport } from '#ui/lib/scrolled-report';
import { type ScrollPosition, ScrollPositionContext } from '#ui/lib/scroll-position';
import { flat } from '#ui/lib/flat-style';
import {
  type Anchor,
  PageScrollContext,
  RailScrollContext,
  RowContext,
} from '#ui/lib/reveal-contexts';
import { nearestOffset, pageOffset } from '#ui/lib/scroll-offsets';
import { ringRoom } from '#ui/lib/scroll-ring-room';

type Reveal = 'start' | 'nearest';

const leadOf = (content: ViewStyle | undefined): number => {
  const value = content?.paddingTop ?? content?.paddingVertical ?? content?.padding;
  return typeof value === 'number' ? value : 0;
};

interface FocusScrollProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Under `start`, where a revealed row rests below the top edge. Under
   *  `nearest`, the room kept between the row and whichever edge it came in
   *  from. */
  offsetFromStart?: number;
  /** `start` (the default) is a television's page: every revealed row comes to
   *  rest at the same height. `nearest` is a list: the page moves only as far
   *  as showing the row whole takes. */
  reveal?: Reveal;
  /** Called when the page leaves or returns to its start. */
  onScrolledChange?: (scrolled: boolean) => void;
}

function AxisScroll({
  children,
  style,
  contentStyle,
  offsetFromStart = 0,
  reveal: mode = 'start',
  onScrolledChange,
  horizontal,
  context: RevealContext,
}: Readonly<
  FocusScrollProps & {
    horizontal: boolean;
    context: Context<((anchor: Anchor) => void) | null>;
  }
>) {
  const pointerDriving = usePointerDriving();
  const scroller = useRef<ScrollView>(null);
  // Must be the view itself: on the new architecture `getInnerViewNode()` answers
  // with a legacy numeric tag that `measureLayout` accepts and silently ignores.
  // react-native-web has no `innerViewRef`, hence the fallback.
  const inner = useRef<View>(null);
  const extent = useRef({ viewport: 0, content: 0 });
  const current = useRef(0);
  const wasScrolled = useRef(false);
  const showing = useRef<Anchor | null>(null);
  const reduced = useReducedMotion();
  const frost = useFrostGlide();
  const [position] = useState<ScrollPosition>(() => ({
    offset: new Animated.Value(0),
    content: inner,
  }));

  const reveal = useCallback(
    (anchor: Anchor) => {
      showing.current = anchor;
      const target = anchor.current;
      // The content view, not the scroller's box: only content coordinates are
      // what a scroll offset is expressed in.
      const measuredAgainst = inner.current ?? scroller.current?.getInnerViewNode();
      if (!target || !measuredAgainst) return;
      target.measureLayout(
        measuredAgainst,
        (left, top, width, height) => {
          const offset = offsetFor({
            mode,
            horizontal,
            box: { left, top, width, height },
            current: current.current,
            offsetFromStart,
            contentStyle,
            ...extent.current,
          });
          if (mode === 'nearest' && offset === current.current) return;
          current.current = offset;
          if (!reduced && frost?.glide(scroller.current, horizontal, offset)) return;
          scroller.current?.scrollTo(
            horizontal ? { x: offset, animated: !reduced } : { y: offset, animated: !reduced },
          );
        },
        // Measuring a view on its way out fails, and that is not an error.
        () => {},
      );
    },
    [contentStyle, frost, horizontal, mode, offsetFromStart, reduced],
  );

  const room = ringRoom(flat(style), flat(contentStyle), horizontal);

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollPositionContext.Provider value={horizontal ? null : position}>
        <ScrollView
          ref={scroller}
          horizontal={horizontal}
          // React 19 types a ref as nullable; React Native's prop does not.
          innerViewRef={inner as RefObject<View>}
          style={room.box}
          contentContainerStyle={room.content}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onLayout={(e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            extent.current.viewport = horizontal ? width : height;
          }}
          scrollEventThrottle={16}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { x, y } = e.nativeEvent.contentOffset;
            current.current = horizontal ? x : y;
            position.offset.setValue(current.current);
            const scrolled = current.current > 1;
            if (scrolled !== wasScrolled.current) {
              wasScrolled.current = scrolled;
              onScrolledChange?.(scrolled);
            }
          }}
          onContentSizeChange={(width: number, height: number) => {
            extent.current.content = horizontal ? width : height;
            // Re-reveal: the content may only now be long enough to bring the
            // anchor where it belongs. Not under the pointer, where re-pinning the
            // old anchor snatches the page back mid-scroll.
            if (showing.current && !pointerDriving()) reveal(showing.current);
          }}
          // A television has no wheel or trackpad, and a scrollable view there is
          // one more thing for the platform to try to focus.
          scrollEnabled={WEB}
        >
          {children}
        </ScrollView>
      </ScrollPositionContext.Provider>
    </RevealContext.Provider>
  );
}

interface OffsetRequest {
  mode: Reveal;
  horizontal: boolean;
  box: { left: number; top: number; width: number; height: number };
  current: number;
  offsetFromStart: number;
  contentStyle: StyleProp<ViewStyle>;
  viewport: number;
  content: number;
}

function offsetFor({
  mode,
  horizontal,
  box,
  current,
  offsetFromStart,
  contentStyle,
  viewport,
  content,
}: OffsetRequest): number {
  const top = horizontal ? box.left : box.top;
  if (mode === 'nearest') {
    return nearestOffset({
      top,
      size: horizontal ? box.width : box.height,
      current,
      margin: offsetFromStart + RING_ROOM,
      viewport,
      content,
    });
  }
  if (horizontal) {
    // The reach above is padding on the content, so every item measures that
    // much further in: without it here the row would scroll the room back out
    // from under the first tile's ring.
    return pageOffset({ top, offsetFromStart: offsetFromStart + RING_ROOM, viewport, content });
  }
  return pageOffset({
    top,
    size: box.height,
    lead: leadOf(flat(contentStyle)),
    offsetFromStart,
    viewport,
    content,
  });
}

function FocusScroll(props: Readonly<FocusScrollProps>) {
  const report = useContext(ScrolledReport);
  return (
    <ScrolledReport.Provider value={null}>
      <AxisScroll
        {...props}
        onScrolledChange={props.onScrolledChange ?? report ?? undefined}
        horizontal={false}
        context={PageScrollContext}
      />
    </ScrolledReport.Provider>
  );
}

/**
 * One rail, scrolled sideways by the focus. A rail inside a page leaves both
 * live at once, and a control asks both (see {@link useRevealOnFocus}).
 */
function FocusRail(props: Readonly<FocusScrollProps>) {
  return <AxisScroll {...props} horizontal context={RailScrollContext} />;
}

/**
 * One row of a page: a place in the navigator's order fixed at first render
 * (rows mount out of visual order), and what the page scrolls to.
 */
function FocusSlot({
  children,
  onActive,
}: Readonly<{ children: ReactNode; onActive?: () => void }>) {
  const row = useRef<View>(null);
  return (
    <NavigatorNode onActive={onActive}>
      <RowContext.Provider value={row}>
        {/* Adds no layout of its own: a column that stretches its child. */}
        <FocusLiftView ref={row}>{children}</FocusLiftView>
      </RowContext.Provider>
    </NavigatorNode>
  );
}

/**
 * One line of a taller row, wrapped in a line-sized scroll anchor inside the
 * slot: no navigator node, no change to the order, finer scroll granularity.
 */
function FocusLine({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const row = useRef<View>(null);
  return (
    <RowContext.Provider value={row}>
      <FocusLiftView ref={row} style={flat(style)}>
        {children}
      </FocusLiftView>
    </RowContext.Provider>
  );
}

export type { FocusScrollProps, Reveal };
export { FocusLine, FocusRail, FocusScroll, FocusSlot };
