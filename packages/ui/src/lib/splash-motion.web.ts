// The splash backdrop's slow drift, web (Tizen / webOS / desktop / browser).
//
// react-native-web silently drops `useNativeDriver` (its TurboModuleRegistry
// returns null), so the native half's pan degrades to a JS timer writing an
// inline transform every frame. Behind a full-screen still on a television that
// is the whole frame budget: it measured 3fps on a 4K panel. `animationKeyframes`
// compiles to a real @keyframes rule instead, so the compositor owns the drift
// and the main thread is free for the cross-fade riding on top of it.

import { useMemo } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import type { DriftSpec } from './splash-motion';

/** react-native-web's keyframe extension, absent from React Native's style types. */
type CssDrift = ViewStyle & {
  animationKeyframes?: Record<string, { transform?: string }>[];
  animationTimingFunction?: string;
  animationIterationCount?: string;
  willChange?: string;
};

// How often the pan is allowed to advance. At a few pixels per second, ten
// steps a second stays sub-pixel and leaves five frames in six with no
// full-screen work at all.
const STEP_HZ = 10;

/** Steps per keyframe leg: the leg's duration at `STEP_HZ`, never fewer than
 *  one (a leg shorter than a step still has to move). */
function steps(spec: Readonly<DriftSpec>): number {
  return Math.max(1, Math.round((spec.ms / 1000) * STEP_HZ));
}

function frames(spec: Readonly<DriftSpec>): CssDrift {
  const { x, y, zoom } = spec;
  // The scale is CONSTANT across the keyframes: a compositor moves an existing
  // texture for free, but re-rasterises a layer whose scale is changing.
  const out = `translate(${x * 100}%, ${y * 100}%) scale(${zoom})`;
  const back = `translate(${-x * 100}%, ${-y * 100}%) scale(${zoom})`;
  return {
    // The round trip is spelt out rather than left to `animation-direction:
    // alternate`, which the legacy Chromium 53 tier does not honour reliably.
    animationKeyframes: [
      { '0%': { transform: out }, '50%': { transform: back }, '100%': { transform: out } },
    ],
    // Stepped, not continuous: a full-screen layer in motion is re-composited
    // under every overlay above it, and a 60Hz pan at single-digit px/s pays
    // that sixty times a second to move less than a pixel (40fps against 60).
    animationTimingFunction: `steps(${steps(spec)}, end)`,
    animationIterationCount: 'infinite',
    // The compositor is asked for its own layer up front, so the first frame of
    // the drift is not also the frame that promotes it.
    willChange: 'transform',
    backfaceVisibility: 'hidden',
  };
}

// `StyleSheet.create` is what turns `animationKeyframes` into a real @keyframes
// rule, and its results are registry keys: spread one into a new object and the
// animation is silently lost. Hence the array returned below, not a spread.
const sheets = new Map<string, ViewStyle>();
function sheet(spec: Readonly<DriftSpec>): ViewStyle {
  const key = `${spec.x}|${spec.y}|${spec.zoom}|${steps(spec)}`;
  const held = sheets.get(key);
  if (held) return held;
  const made = StyleSheet.create({ drift: frames(spec) as ViewStyle }).drift;
  sheets.set(key, made);
  return made;
}

/**
 * The drift for the artwork layer: a slow pan across a frame held oversized for
 * it, out and back, forever. Plain styles, so it rides on the `Animated.View`
 * the native half needs.
 */
export function useDrift(spec: Readonly<DriftSpec>): StyleProp<ViewStyle> {
  const { x, y, zoom, ms, width, height } = spec;
  return useMemo(() => {
    // A zero-height box is the frame before layout: there is nothing to pan yet,
    // and starting the rule now only means restarting it on the next frame.
    if (!width || !height) return null;
    return [
      sheet({ x, y, zoom, ms, width, height }),
      { animationDuration: `${ms * 2}ms` } as ViewStyle,
    ];
  }, [x, y, zoom, ms, width, height]);
}

/** The colour grade for the artwork.
 *
 * It rides the IMAGE, never the drifting view above it: a filter is re-run over
 * whatever its element renders, so on the animated node it re-graded a
 * full-screen still every frame it moved. Held on something that never moves,
 * it is rasterised once and the drift transforms the result. */
export const GRADE: StyleProp<ViewStyle> = StyleSheet.create({
  grade: { filter: 'brightness(0.86) saturate(1.02)' } as ViewStyle,
}).grade;
