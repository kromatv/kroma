// Looping animations, native (Apple TV / Android TV / phone).
//
// One hook for the three loops the kit runs forever - the busy ring's rotation,
// the skeleton's pulse and the caret's blink - so a component that needs one
// stays a single file instead of being split per platform for the sake of an
// animation. See loop.web.ts for the browser half, which spells the same three
// loops as CSS keyframes.
//
// Here they are Animated with `useNativeDriver`, so they run on the UI thread
// and the JS thread never wakes for a frame.

import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** `spin` rotates a full turn; `pulse` breathes the opacity down and back;
 *  `blink` is the caret's hard on/off. */
export type LoopKind = 'spin' | 'pulse' | 'blink';

/** How faint the pulse gets at the bottom of its breath. */
const PULSE_LOW = 0.55;

const FLOOR: Record<LoopKind, number> = { spin: 0, pulse: PULSE_LOW, blink: 0 };

/**
 * A style that loops for as long as it is mounted, or `null` when `active` is
 * false (nothing is animated and nothing is scheduled).
 *
 * The result belongs on an `Animated.View`: it carries an `Animated.Value`,
 * which is why it is cast rather than typed - a driven value is not a `number`,
 * and `Animated.View` is the component that knows the difference.
 */
export function useLoop(kind: LoopKind, ms: number, active = true): StyleProp<ViewStyle> {
  const value = useRef(new Animated.Value(kind === 'spin' ? 0 : 1)).current;

  useEffect(() => {
    if (!active) return;
    value.setValue(kind === 'spin' ? 0 : 1);
    const half = ms / 2;
    const loop =
      kind === 'spin'
        ? Animated.loop(
            Animated.timing(value, {
              toValue: 1,
              duration: ms,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
          )
        : Animated.loop(
            Animated.sequence([
              Animated.timing(value, {
                toValue: FLOOR[kind],
                duration: half,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(value, {
                toValue: 1,
                duration: half,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          );
    loop.start();
    return () => loop.stop();
  }, [kind, ms, active, value]);

  if (!active) return null;
  if (kind === 'spin') {
    return {
      transform: [
        { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
      ],
    } as unknown as StyleProp<ViewStyle>;
  }
  return { opacity: value } as unknown as StyleProp<ViewStyle>;
}
