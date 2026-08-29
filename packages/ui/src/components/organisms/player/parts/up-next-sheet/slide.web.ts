// The sheet's slide, web (Tizen / webOS / desktop / browser).
//
// A CSS transition rather than Animated: react-native-web has no native driver,
// so an Animated value there is a rAF loop writing an inline transform every
// frame - against a player that is already re-rendering its chrome and decoding
// video. `transition: transform` stays on the compositor.

import type { StyleProp, ViewStyle } from 'react-native';
import { ease } from '#ui/lib/ease';

const SLIDE_MS = 340;

/** The sheet's transform: home when `open`, parked `by` pixels down the screen
 * when not. Plain styles, so it rides on the `Animated.View` the native half
 * needs. */
export function useSheetSlide(open: boolean, by: number): StyleProp<ViewStyle> {
  return {
    transform: [{ translateY: open ? 0 : by }],
    transitionProperty: 'transform',
    transitionDuration: `${SLIDE_MS}ms`,
    transitionTimingFunction: ease.out.css,
  } as ViewStyle;
}
