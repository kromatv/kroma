// Looping animations, native (Apple TV / Android TV / phone).
//
// One hook for the loops the kit runs forever - the busy ring's rotation, the
// indeterminate bar's sweep, the skeleton's pulse, the caret's blink and the
// halo behind a listening microphone - so a component that needs one stays a
// single file instead of being split per platform for the sake of an animation.
// See loop.web.ts for the browser half, which spells the same loops as CSS
// keyframes.
//
// All but `sweep` are Animated with `useNativeDriver`, so they run on the UI
// thread and the JS thread never wakes for a frame.

import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  type EasingFunction,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** `spin` rotates a full turn; `sweep` travels a segment across its parent and
 *  carries its own width; `pulse` breathes the opacity down and back; `blink` is
 *  the caret's hard on/off; `halo` swells past the box it sits behind as it
 *  fades away. */
export type LoopKind = 'spin' | 'sweep' | 'pulse' | 'blink' | 'halo';

/** How faint the pulse gets at the bottom of its breath. */
const PULSE_LOW = 0.55;

// The kinds that breathe there and back, and the value each breathes down to;
// `spin` and `sweep` run one way and restart.
const FLOOR = { pulse: PULSE_LOW, blink: 0 } as const;

// Two fifths of the track, travelling from just off one end to just off the other.
const SWEEP_WIDTH = '40%';
const SWEEP_FROM = '-40%';
const SWEEP_TO = '100%';

const HALO_OPACITY = 0.35;
const HALO_FROM = 0.8;
const HALO_TO = 1.3;

function breathes(kind: LoopKind): kind is keyof typeof FLOOR {
  return kind in FLOOR;
}

function leg(value: Animated.Value, toValue: number, duration: number, easing: EasingFunction) {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

function cycle(kind: LoopKind, value: Animated.Value, ms: number): Animated.CompositeAnimation {
  const half = ms / 2;
  if (breathes(kind)) {
    return Animated.sequence([
      leg(value, FLOOR[kind], half, Easing.inOut(Easing.ease)),
      leg(value, 1, half, Easing.inOut(Easing.ease)),
    ]);
  }
  if (kind === 'halo') {
    return Animated.sequence([
      leg(value, 1, half, Easing.out(Easing.ease)),
      leg(value, 0, half, Easing.in(Easing.ease)),
    ]);
  }
  return Animated.timing(value, {
    toValue: 1,
    duration: ms,
    easing: kind === 'spin' ? Easing.linear : Easing.inOut(Easing.ease),
    // `left` is not a native-driver property, so the sweep is the one
    // loop the JS thread has to write a frame for.
    useNativeDriver: kind !== 'sweep',
  });
}

/**
 * A style that loops for as long as it is mounted, or `null` when `active` is
 * false (nothing is animated and nothing is scheduled).
 *
 * The result belongs on an `Animated.View`: it carries an `Animated.Value`,
 * which is why it is cast rather than typed - a driven value is not a `number`,
 * and `Animated.View` is the component that knows the difference.
 */
export function useLoop(kind: LoopKind, ms: number, active = true): StyleProp<ViewStyle> {
  const [value] = useState(() => new Animated.Value(breathes(kind) ? 1 : 0));

  useEffect(() => {
    if (!active) return;
    value.setValue(breathes(kind) ? 1 : 0);
    const loop = Animated.loop(cycle(kind, value, ms));
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
  if (kind === 'sweep') {
    return {
      width: SWEEP_WIDTH,
      // React Native cannot interpret a percentage in a transform, so the
      // segment travels on `left` rather than on translateX.
      left: value.interpolate({ inputRange: [0, 1], outputRange: [SWEEP_FROM, SWEEP_TO] }),
    } as unknown as StyleProp<ViewStyle>;
  }
  if (kind === 'halo') {
    return {
      opacity: value.interpolate({ inputRange: [0, 1], outputRange: [HALO_OPACITY, 0] }),
      transform: [
        { scale: value.interpolate({ inputRange: [0, 1], outputRange: [HALO_FROM, HALO_TO] }) },
      ],
    } as unknown as StyleProp<ViewStyle>;
  }
  return { opacity: value } as unknown as StyleProp<ViewStyle>;
}
