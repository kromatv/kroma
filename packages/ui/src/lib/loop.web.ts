// Looping animations, web (Tizen / webOS / desktop / browser).
//
// The native half of this hook (loop.ts) animates with `useNativeDriver: true`.
// On the web that flag is a lie, and silently: react-native-web ships React
// Native's Animated with `TurboModuleRegistry.get()` hard-wired to return null,
// so `shouldUseNativeDriver` is false, the flag is dropped and the loop falls
// back to a JS timer that writes an inline style on EVERY frame.
//
// That is not academic. The busy ring is on screen for exactly as long as the
// player is buffering - so it spends a television's CPU competing with the
// decode it is waiting for - and a loading grid pulses a skeleton per tile, each
// one its own per-frame callback and style recalculation. It is the stutter the
// spinner is meant to apologise for, caused by the spinner.
//
// react-native-web compiles `animationKeyframes` into a real @keyframes rule and
// hands the element a class, so the same three loops run on the compositor and
// cost nothing per frame. Standard CSS animation, which the legacy Chromium 53
// tier understands as well as the modern one.

import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

/** `spin` rotates a full turn; `pulse` breathes the opacity down and back;
 *  `blink` is the caret's hard on/off. */
export type LoopKind = 'spin' | 'pulse' | 'blink';

/** How faint the pulse gets at the bottom of its breath. */
const PULSE_LOW = 0.55;

/** react-native-web's keyframe extension, which React Native's style types have
 * no reason to know about. Declared here rather than as a global augmentation so
 * the escape hatch stays where it is used. */
type CssLoop = ViewStyle & {
  animationKeyframes?: Record<string, ViewStyle & { transform?: string }>[];
  animationTimingFunction?: string;
  animationIterationCount?: string;
};

/** Compiled ONCE, at module load: `StyleSheet.create` is what turns
 * `animationKeyframes` into a real `@keyframes` rule. The returned objects are
 * the keys into that registry, so they must be handed on by reference - spread
 * one into a new object and it is an unknown style again, which quietly falls
 * back to an inline `animation-keyframes` the browser ignores. Hence the array
 * below rather than `{ ...loops[kind], animationDuration }`. */
const KEYFRAMES: Record<LoopKind, CssLoop> = {
  spin: {
    animationKeyframes: [
      { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
    ],
    animationTimingFunction: 'linear',
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

/**
 * A style that loops for as long as it is mounted, or `null` when `active` is
 * false. Plain styles, so it rides on the `Animated.View` the native half needs
 * without costing anything - which is what lets the components using it stay
 * single-file across the two platforms.
 */
export function useLoop(kind: LoopKind, ms: number, active = true): StyleProp<ViewStyle> {
  if (!active) return null;
  return [loops[kind], { animationDuration: `${ms}ms` } as ViewStyle];
}
