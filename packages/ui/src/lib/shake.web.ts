// The refusal wobble, web (Tizen / webOS / desktop / browser).
//
// A CSS transition per leg rather than Animated: react-native-web has no native
// driver, so an Animated value there is a rAF loop, and this fires at the one
// moment the JS thread is busiest - as the refused request resolves.
//
// Not a keyframe rule, which is what lib/loop uses: react-native-web names a
// rule by hashing its keyframes, so a second identical rule to alternate with
// would compile to the same name and the wobble could never be re-fired.

import { useEffect, useState } from 'react';
import type { Animated, ViewStyle } from 'react-native';
import { useReducedMotion } from '#ui/lib/reduced-motion';

const TRAVEL_PX = 8;
const LEG_MS = 80;
const LEGS = [-TRAVEL_PX, TRAVEL_PX, -TRAVEL_PX, TRAVEL_PX, 0] as const;
const HOME = 0;

// `Easing.inOut(Easing.ease)` in the other dialect, as lib/loop spells the same
// pair for its breathing kinds.
const LEG = {
  transitionProperty: 'transform',
  transitionDuration: `${LEG_MS}ms`,
  transitionTimingFunction: 'ease-in-out',
};

/** A transform that shakes once every time `at` changes, and nothing at all on
 * the first render or under reduced motion. */
export function useShake(at: number): Animated.WithAnimatedValue<ViewStyle> {
  const [travel, setTravel] = useState<number>(HOME);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (at === 0 || reduced) return;
    setTravel(LEGS[0]);
    // Each leg is scheduled off the same instant, so a late timer costs its own
    // leg and never the ones behind it.
    const timers = LEGS.slice(1).map((to, leg) =>
      setTimeout(() => setTravel(to), (leg + 1) * LEG_MS),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
      setTravel(HOME);
    };
  }, [at, reduced]);

  return { ...LEG, transform: [{ translateX: travel }] } as Animated.WithAnimatedValue<ViewStyle>;
}
