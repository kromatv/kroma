// The end screen's entrance, native (Apple TV / Android TV).
//
// Driven by Animated with `useNativeDriver`, so it runs on the UI thread while
// the player tears its engine down behind it. See rise.web.ts for the browser
// half, which spells the same movement as a CSS transition.

import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { ease } from '#ui/lib/ease';

export const RISE_MS = 420;
export const RISE_PX = 26;

export interface Rise {
  /** The art and its scrims, fading up from black. */
  veil: StyleProp<ViewStyle>;
  /** The copy, arriving a little from below. */
  copy: StyleProp<ViewStyle>;
}

/** A film does not cut to a menu: the art fades up and the copy settles into
 * it. Both belong on an `Animated.View`, since they carry an `Animated.Value`. */
export function useRise(): Rise {
  const [run] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.timing(run, {
      toValue: 1,
      duration: RISE_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [run]);

  return {
    veil: { opacity: run } as unknown as StyleProp<ViewStyle>,
    copy: {
      opacity: run,
      transform: [
        { translateY: run.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] }) },
      ],
    } as unknown as StyleProp<ViewStyle>,
  };
}
