// The end screen's entrance, web (Tizen / webOS / desktop / browser).
//
// A CSS transition rather than Animated: react-native-web has no native driver,
// so an Animated value there is a rAF loop writing an inline style every frame.
// The rest state is painted for one frame first, since a transition needs
// somewhere to come from.

import { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ease } from '#ui/lib/ease';

export const RISE_MS = 420;
export const RISE_PX = 26;

export interface Rise {
  veil: StyleProp<ViewStyle>;
  copy: StyleProp<ViewStyle>;
}

const TRANSITION = {
  transitionProperty: 'opacity, transform',
  transitionDuration: `${RISE_MS}ms`,
  transitionTimingFunction: ease.out.css,
} as const;

/** A film does not cut to a menu: the art fades up and the copy settles into
 * it. Plain styles, so they ride on the `Animated.View` the native half needs. */
export function useRise(): Rise {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return {
    veil: { opacity: arrived ? 1 : 0, ...TRANSITION } as ViewStyle,
    copy: {
      opacity: arrived ? 1 : 0,
      transform: [{ translateY: arrived ? 0 : RISE_PX }],
      ...TRANSITION,
    } as ViewStyle,
  };
}
