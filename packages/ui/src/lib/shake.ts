// Animated rather than a keyframe: a @keyframes rule cannot be re-fired, which
// is why lib/loop.ts has a web half and this has none.

import { useEffect, useState } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { useReducedMotion } from '#ui/lib/reduced-motion';

const TRAVEL_PX = 8;
const LEG_MS = 80;
const LEGS = [-TRAVEL_PX, TRAVEL_PX, -TRAVEL_PX, TRAVEL_PX, 0];

/**
 * A transform that shakes once every time `at` changes, and nothing at all on
 * the first render or under reduced motion. Pass a count of refusals; the value
 * itself is never read. The result belongs on an `Animated.View`: it carries an
 * `Animated.Value`.
 */
export function useShake(at: number): Animated.WithAnimatedValue<ViewStyle> {
  const [travel] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();

  useEffect(() => {
    if (at === 0 || reduced) return;
    const wobble = Animated.sequence(
      LEGS.map((to) =>
        Animated.timing(travel, {
          toValue: to,
          duration: LEG_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ),
    );
    wobble.start();
    return () => {
      wobble.stop();
      travel.setValue(0);
    };
  }, [at, reduced, travel]);

  return { transform: [{ translateX: travel }] };
}
