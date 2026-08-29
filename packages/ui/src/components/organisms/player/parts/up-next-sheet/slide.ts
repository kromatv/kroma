// The sheet's slide, native (Apple TV / Android TV).
//
// Driven by Animated with `useNativeDriver`, so the travel runs on the UI thread
// while the player chrome keeps re-rendering behind it. See slide.web.ts for the
// browser half, which spells the same travel as a CSS transition.

import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { ease } from '#ui/lib/ease';

const SLIDE_MS = 340;

/** The sheet's transform: home when `open`, parked `by` pixels down the screen
 * when not. The result belongs on an `Animated.View`: it carries an
 * `Animated.Value`. */
export function useSheetSlide(open: boolean, by: number): StyleProp<ViewStyle> {
  const [slide] = useState(() => new Animated.Value(open ? 0 : 1));

  useEffect(() => {
    const anim = Animated.timing(slide, {
      toValue: open ? 0 : 1,
      duration: SLIDE_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [open, slide]);

  // Interpolated rather than animated to `by` outright, so a sheet that is
  // remeasured while parked corrects its rest position without a second timing.
  return {
    transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, by] }) }],
  } as unknown as StyleProp<ViewStyle>;
}
