// <FocusScroll> and <FocusSlot>: the page, scrolled by the focus, one ROW at a
// time. A control that is in no row is its own row.

import {
  type Context,
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useRef,
} from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SpatialNavigationNode } from 'react-tv-space-navigation';
import { pointerDriving } from '#ui/lib/input-source';

const WEB = Platform.OS === 'web';

type Anchor = RefObject<View | null>;

const PageScrollContext = createContext<((anchor: Anchor) => void) | null>(null);

const RowContext = createContext<Anchor | null>(null);

// react-tv-space-navigation's own rail scroller is unusable: React 19 spreads
// `ref` like any prop and <Focusable>'s wins, so the library's ref is null.
const RailScrollContext = createContext<((anchor: Anchor) => void) | null>(null);

// The tvos react-native fork's ViewStyle and mainline's are not assignable to
// each other; flatten once, here.
const flat = (style: StyleProp<ViewStyle>): ViewStyle | undefined =>
  StyleSheet.flatten(style) as ViewStyle | undefined;

interface PageMetrics {
  top: number;
  offsetFromStart: number;
  viewport: number;
  content: number;
}

function pageOffset({ top, offsetFromStart, viewport, content }: PageMetrics): number {
  const last = Math.max(0, content - viewport);
  return Math.min(Math.max(top - offsetFromStart, 0), last);
}

interface FocusScrollProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  offsetFromStart?: number;
}

function AxisScroll({
  children,
  style,
  contentStyle,
  offsetFromStart = 0,
  horizontal,
  context: RevealContext,
}: Readonly<
  FocusScrollProps & {
    horizontal: boolean;
    context: Context<((anchor: Anchor) => void) | null>;
  }
>) {
  const scroller = useRef<ScrollView>(null);
  // Must be the view itself: on the new architecture `getInnerViewNode()` answers
  // with a legacy numeric tag that `measureLayout` accepts and silently ignores.
  // react-native-web has no `innerViewRef`, hence the fallback.
  const inner = useRef<View>(null);
  const extent = useRef({ viewport: 0, content: 0 });
  const showing = useRef<Anchor | null>(null);

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
        (left, top) => {
          const { viewport, content } = extent.current;
          const offset = pageOffset({
            top: horizontal ? left : top,
            offsetFromStart,
            viewport,
            content,
          });
          scroller.current?.scrollTo(
            horizontal ? { x: offset, animated: true } : { y: offset, animated: true },
          );
        },
        // Measuring a view on its way out fails, and that is not an error.
        () => {},
      );
    },
    [horizontal, offsetFromStart],
  );

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={scroller}
        horizontal={horizontal}
        // React 19 types a ref as nullable; React Native's prop does not.
        innerViewRef={inner as RefObject<View>}
        style={flat(style)}
        contentContainerStyle={flat(contentStyle)}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          extent.current.viewport = horizontal ? width : height;
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
    </RevealContext.Provider>
  );
}

function FocusScroll(props: Readonly<FocusScrollProps>) {
  return <AxisScroll {...props} horizontal={false} context={PageScrollContext} />;
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
    <SpatialNavigationNode onActive={onActive}>
      <RowContext.Provider value={row}>
        {/* Adds no layout of its own: a column that stretches its child. */}
        <View ref={row}>{children}</View>
      </RowContext.Provider>
    </SpatialNavigationNode>
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
      <View ref={row} style={flat(style)}>
        {children}
      </View>
    </RowContext.Provider>
  );
}

/**
 * What a control uses to ask to be shown when it takes the focus: the page
 * reveals its row (or the control when it is in none), the rail the control.
 */
function useRevealOnFocus(self: Anchor): () => void {
  const page = useContext(PageScrollContext);
  const rail = useContext(RailScrollContext);
  const row = useContext(RowContext);
  return useCallback(() => {
    // A focus the pointer produced reveals nothing: scrolling under a cursor
    // that has not moved cascades into the page walking off on its own.
    if (pointerDriving()) return;
    rail?.(self);
    page?.(row ?? self);
  }, [page, rail, row, self]);
}

export type { Anchor, FocusScrollProps, PageMetrics };
export { FocusLine, FocusRail, FocusScroll, FocusSlot, pageOffset, useRevealOnFocus };
