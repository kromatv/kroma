import { useEffect, useRef } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';

/** What a scroller needs to keep a cursor on screen. `reveal` says where to move to for
 *  the scroll offset and the height it is given, or null when the cursor is in view, and
 *  `viewport` is the height to assume until the scroller has been measured. */
function useCursorScroll(
  reveal: (offset: number, viewport: number) => number | null,
  viewport: number,
) {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const height = useRef(viewport);

  useEffect(() => {
    const y = reveal(offset.current, height.current);
    if (y !== null) ref.current?.scrollTo({ y, animated: false });
  }, [reveal]);

  return {
    ref,
    scrollEventThrottle: 16,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
    },
    onLayout: (event: LayoutChangeEvent) => {
      height.current = event.nativeEvent.layout.height;
    },
  };
}

export { useCursorScroll };
