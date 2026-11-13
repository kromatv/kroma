import { useMemo } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
} from 'react-native';

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

const NativeDrivenScrollView = Animated.ScrollView as unknown as typeof ScrollView;

/**
 * How a scroller says where it is: the `Scroller` to render and the `onScroll`
 * to hand it, which calls `onOffset` with every offset along `axis`. Given
 * `driven`, the scroll also moves that value on the UI thread, in the frame the
 * scroll itself moves: set from JavaScript, what follows the page (see
 * `ScrollMask`) trails it by the frames the round trip takes. Keep `onOffset`
 * stable: a new one attaches the scroll event again.
 */
export function useScrollOffset(
  axis: 'x' | 'y',
  onOffset: (offset: number) => void,
  driven: Animated.Value | null,
) {
  const onScroll = useMemo(() => {
    const listener = (event: ScrollEvent) => onOffset(event.nativeEvent.contentOffset[axis]);
    if (driven === null) return listener;
    return Animated.event([{ nativeEvent: { contentOffset: { [axis]: driven } } }], {
      useNativeDriver: true,
      listener,
    });
  }, [axis, driven, onOffset]);
  return { onScroll, Scroller: driven === null ? ScrollView : NativeDrivenScrollView };
}
