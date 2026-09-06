// Looping animations, web (Tizen / webOS / desktop / browser).
//
// react-native-web silently drops `useNativeDriver` (its TurboModuleRegistry
// returns null), leaving a JS timer that writes an inline style every frame.
// `animationKeyframes` compiles to a real @keyframes rule, so the loops run on
// the compositor instead, including on the legacy Chromium 53 tier.

import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { sharedStyle } from '#ui/core';

export type LoopKind = 'spin' | 'sweep' | 'pulse' | 'blink' | 'halo';

const PULSE_LOW = 0.55;

// Two fifths of the track, travelling from just off one end to just off the
// other: 250% of the segment's own width is 100% of its parent's.
const SWEEP_WIDTH = '40%';

const HALO_OPACITY = 0.35;
const HALO_FROM = 0.8;
const HALO_TO = 1.3;

type CssStep = ViewStyle & { transform?: string; animationTimingFunction?: string };

/** react-native-web's keyframe extension, absent from React Native's style types. */
type CssLoop = ViewStyle & {
  animationKeyframes?: Record<string, CssStep>[];
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
  halo: {
    // `ease-out` out and `ease-in` back, which is what `Easing.out(Easing.ease)`
    // and `Easing.in(Easing.ease)` are: RN's `Easing.ease` IS cubic-bezier(0.42,
    // 0, 1, 1), the curve CSS calls `ease-in`.
    animationKeyframes: [
      {
        '0%': {
          opacity: HALO_OPACITY,
          transform: `scale(${HALO_FROM})`,
          animationTimingFunction: 'ease-out',
        },
        '50%': {
          opacity: 0,
          transform: `scale(${HALO_TO})`,
          animationTimingFunction: 'ease-in',
        },
        '100%': { opacity: HALO_OPACITY, transform: `scale(${HALO_FROM})` },
      },
    ],
    animationIterationCount: 'infinite',
  },
};

const loops = StyleSheet.create(KEYFRAMES);

/** A style that loops for as long as it is mounted, or `null` when `active` is
 * false. Plain styles, so it rides on the `Animated.View` the native half needs. */
export function useLoop(kind: LoopKind, ms: number, active = true): StyleProp<ViewStyle> {
  if (!active) return null;
  return [loops[kind], sharedStyle(`loop:${ms}`, { animationDuration: `${ms}ms` })];
}
