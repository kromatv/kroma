// The OS setting natively, and `prefers-reduced-motion` in a browser, which is
// what react-native-web answers this from.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when motion should be dropped rather than merely shortened. Starts false
 * and settles on the first answer, since the platform only reports the setting
 * asynchronously: an animation that fires on mount plays once before the answer
 * arrives.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduced(on);
    });
    // react-native-web hands back nothing at all where there is no `matchMedia`
    // to listen to, so the subscription is optional however it is typed.
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      listener?.remove();
    };
  }, []);

  return reduced;
}
