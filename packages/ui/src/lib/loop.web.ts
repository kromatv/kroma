// Looping animations, web (Tizen / webOS / desktop / browser).
//
// react-native-web silently drops `useNativeDriver` (its TurboModuleRegistry
// returns null), leaving a JS timer that writes an inline style every frame.
// `animationKeyframes` compiles to a real @keyframes rule, so the loops run on
// the compositor instead, including on the legacy Chromium 53 tier.

import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

export type LoopKind = 'spin' | 'sweep' | 'pulse' | 'blink';

const PULSE_LOW = 0.55;

// Two fifths of the track, travelling from just off one end to just off the
// other: 250% of the segment's own width is 100% of its parent's.
const SWEEP_WIDTH = '40%';

/** react-native-web's keyframe extension, absent from React Native's style types. */
type CssLoop = ViewStyle & {
  animationKeyframes?: Record<string, ViewStyle & { transform?: string }>[];
  animationTimingFunction?: string;
  animationIterationCount?: string;
};

// `StyleSheet.create` is what turns `animationKeyframes` into a real `@keyframes`
// rule, and its results are registry keys: spread one into a new object and the
// animation is silently lost. Hence the array in `useLoop`, not a spread.
const KEYFRAMES: Record<LoopKind, CssLoop> = {
  spin: {
    animationKeyframes: [
      { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
    ],
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  sweep: {
    width: SWEEP_WIDTH,
    animationKeyframes: [
      { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
    ],
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  pulse: {
    animationKeyframes: [
      { '0%': { opacity: PULSE_LOW }, '50%': { opacity: 1 }, '100%': { opacity: PULSE_LOW } },
    ],
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  blink: {
    animationKeyframes: [{ '0%': { opacity: 1 }, '50%': { opacity: 0 }, '100%': { opacity: 1 } }],
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
};

const loops = StyleSheet.create(KEYFRAMES);

/** A style that loops for as long as it is mounted, or `null` when `active` is
 * false. Plain styles, so it rides on the `Animated.View` the native half needs. */
export function useLoop(kind: LoopKind, ms: number, active = true): StyleProp<ViewStyle> {
  if (!active) return null;
  return [loops[kind], { animationDuration: `${ms}ms` } as ViewStyle];
}
