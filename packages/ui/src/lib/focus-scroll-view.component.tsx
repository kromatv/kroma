import { type ReactNode, type RefObject, useCallback, useRef } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { style as staticStyle } from '#ui/core';
import { RING_ROOM } from '#ui/core/tokens';
import { usePointerDriving } from '#ui/lib/input-source';
import { useReducedMotion } from '#ui/lib/reduced-motion.hook';
import {
  type Anchor,
  PageScrollContext,
  RailScrollContext,
  RowContext,
} from '#ui/lib/reveal-contexts';
import { bandOffset } from '#ui/lib/scroll-offsets';

interface FocusScrollViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

interface Extent {
  offset: number;
  viewport: number;
  content: number;
}

const GROW = staticStyle({ flexGrow: 1 });

const ignore = () => {};

function follow(box: { top: number; size: number }, extent: Extent, scroll: (y: number) => void) {
  const { offset, viewport, content } = extent;
  const next = bandOffset({ ...box, current: offset, margin: RING_ROOM, viewport, content });
  if (next !== offset) {
    extent.offset = next;
    scroll(next);
  }
}

function useRevealIn(inner: RefObject<View | null>, extent: RefObject<Extent>) {
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const showing = useRef<Anchor | null>(null);
  const reveal = useCallback(
    (anchor: Anchor) => {
      showing.current = anchor;
      const content = inner.current;
      if (!anchor.current || !content || extent.current.viewport === 0) {
        return;
      }
      const scroll = (y: number) => {
        scroller.current?.scrollTo({ y, animated: !reduced });
      };
      anchor.current.measureLayout(
        content,
        (...[, top, , size]) => follow({ top, size }, extent.current, scroll),
        ignore,
      );
    },
    [extent, inner, reduced],
  );
  return { scroller, showing, reveal };
}

function useReveal() {
  const pointerDriving = usePointerDriving();
  const inner = useRef<View>(null);
  const extent = useRef<Extent>({ offset: 0, viewport: 0, content: 0 });
  const { scroller, showing, reveal } = useRevealIn(inner, extent);
  const again = () => {
    if (showing.current && !pointerDriving()) {
      reveal(showing.current);
    }
  };
  const handlers = {
    onLayout: (event: LayoutChangeEvent) => {
      extent.current.viewport = event.nativeEvent.layout.height;
      again();
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      extent.current.offset = event.nativeEvent.contentOffset.y;
    },
    onContentSizeChange: (_width: number, height: number) => {
      extent.current.content = height;
      again();
    },
  };
  return { scroller, inner, reveal, handlers };
}

/**
 * A surface's scrolling band. Touch, a wheel and a pointer scroll it as they
 * scroll any `ScrollView`; the focus scrolls it too, by just as far as showing
 * the focused control whole takes. Whatever it holds asks it alone to be shown,
 * never a page or a rail behind the surface.
 */
export function FocusScrollView({
  children,
  style,
  contentContainerStyle,
}: Readonly<FocusScrollViewProps>) {
  const { scroller, inner, reveal, handlers } = useReveal();
  return (
    <PageScrollContext value={reveal}>
      <RailScrollContext value={null}>
        <RowContext value={null}>
          <ScrollView
            ref={scroller}
            style={style}
            contentContainerStyle={GROW}
            scrollEventThrottle={16}
            {...handlers}
          >
            <View ref={inner} style={contentContainerStyle}>
              {children}
            </View>
          </ScrollView>
        </RowContext>
      </RailScrollContext>
    </PageScrollContext>
  );
}
