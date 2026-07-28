// @vitest-environment jsdom
//
// The three forever-loops the kit runs - the busy ring's rotation, the
// skeleton's pulse and the caret's blink - on both platforms.
//
// The pair exists so a component that needs one of them stays a single file, and
// the price of that is a shared contract neither half can see: `active: false`
// must return null AND schedule nothing, all three kinds must answer on both,
// and the result must sit on an `Animated.View` either way.
//
// Each half then has one thing that is the entire reason it was written.
// Native drives on the UI thread (`useNativeDriver: true`), so the JS thread
// never wakes for a frame. The web half hands back the SHARED StyleSheet object
// by reference, because that reference is the key into react-native-web's
// compiled `@keyframes` registry - spread it into a new object and it is an
// unknown style that silently falls back to an inline property the browser
// ignores, which is the per-frame JS timer the whole file exists to avoid.

import { renderHook } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LoopKind, useLoop } from './loop';
import { useLoop as useLoopWeb } from './loop.web';

const KINDS: LoopKind[] = ['spin', 'pulse', 'blink'];

/** The web half calls no hooks - it is a lookup - but render it as one anyway,
 *  so the rules-of-hooks lint stays meaningful over this file. */
function webLoop(kind: LoopKind, ms: number, active?: boolean) {
  return renderHook(() => useLoopWeb(kind, ms, active)).result.current;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the native half', () => {
  it('drives on the UI thread, which is the reason it is Animated at all', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { unmount } = renderHook(() => useLoop('spin', 800));
    expect(timing).toHaveBeenCalled();
    // Every leg of every loop: one that forgot the flag would wake the JS thread
    // once a frame for as long as the component is mounted.
    for (const [, config] of timing.mock.calls) {
      expect(config).toMatchObject({ useNativeDriver: true });
    }
    unmount();
  });

  it('rotates a full turn for spin', () => {
    const { result, unmount } = renderHook(() => useLoop('spin', 800));
    const style = result.current as { transform: [{ rotate: unknown }] };
    expect(style.transform).toHaveLength(1);
    // An interpolation, not a string: the value is driven.
    expect(style.transform[0].rotate).toBeTypeOf('object');
    unmount();
  });

  it('breathes the opacity for pulse and blink', () => {
    for (const kind of ['pulse', 'blink'] as const) {
      const { result, unmount } = renderHook(() => useLoop(kind, 800));
      const style = result.current as { opacity: unknown };
      expect(style.opacity).toBeTypeOf('object');
      expect(style).not.toHaveProperty('transform');
      unmount();
    }
  });

  it('runs pulse and blink as a there-and-back sequence', () => {
    const sequence = vi.spyOn(Animated, 'sequence');
    const { unmount } = renderHook(() => useLoop('pulse', 800));
    // Down to the floor and back, each half the total - so one cycle of the
    // stated duration is one full breath rather than two.
    const [legs] = sequence.mock.calls[0] ?? [];
    expect(legs).toHaveLength(2);
    unmount();
  });

  it('spins in one direction instead, with no sequence', () => {
    const sequence = vi.spyOn(Animated, 'sequence');
    const { unmount } = renderHook(() => useLoop('spin', 800));
    // A rotation that reversed halfway would rock rather than spin.
    expect(sequence).not.toHaveBeenCalled();
    unmount();
  });

  it('schedules NOTHING while inactive', () => {
    const loop = vi.spyOn(Animated, 'loop');
    const { result } = renderHook(() => useLoop('spin', 800, false));
    expect(result.current).toBeNull();
    // Not merely invisible: a hidden spinner still animating is the cost this
    // flag exists to avoid.
    expect(loop).not.toHaveBeenCalled();
  });

  it('starts when it becomes active', () => {
    const loop = vi.spyOn(Animated, 'loop');
    const { result, rerender } = renderHook(({ on }) => useLoop('spin', 800, on), {
      initialProps: { on: false },
    });
    expect(loop).not.toHaveBeenCalled();
    rerender({ on: true });
    expect(loop).toHaveBeenCalledOnce();
    expect(result.current).not.toBeNull();
  });

  it('stops the loop on unmount', () => {
    const loop = vi.spyOn(Animated, 'loop');
    const { unmount } = renderHook(() => useLoop('spin', 800));
    const composite = loop.mock.results[0]?.value as { stop: () => void };
    const stop = vi.spyOn(composite, 'stop');
    unmount();
    // An animation left running holds the component's value alive and keeps
    // asking for frames after the spinner is gone.
    expect(stop).toHaveBeenCalled();
  });

  it('restarts rather than retimes when the duration changes', () => {
    const loop = vi.spyOn(Animated, 'loop');
    const { rerender, unmount } = renderHook(({ ms }) => useLoop('pulse', ms), {
      initialProps: { ms: 800 },
    });
    rerender({ ms: 1600 });
    expect(loop).toHaveBeenCalledTimes(2);
    unmount();
  });
});

describe('the web half', () => {
  it('hands back the shared StyleSheet object BY REFERENCE', () => {
    const [styleA] = webLoop('spin', 800) as unknown[];
    const [styleB] = webLoop('spin', 1600) as unknown[];
    // The identity IS the key into the compiled @keyframes registry. Two
    // different durations must still be the same registered animation.
    expect(styleA).toBe(styleB);
  });

  it('carries the duration alongside rather than inside', () => {
    const [, duration] = webLoop('pulse', 1200) as unknown[];
    // An array, not a spread: spreading the registry object into a new one turns
    // it back into an unknown style the browser ignores.
    expect(duration).toEqual({ animationDuration: '1200ms' });
  });

  it('registers a distinct animation per kind', () => {
    const first = KINDS.map((kind) => (webLoop(kind, 800) as unknown[])[0]);
    expect(new Set(first).size).toBe(KINDS.length);
  });

  it('returns null while inactive, costing the page nothing', () => {
    expect(webLoop('spin', 800, false)).toBeNull();
  });
});

describe('the two halves together', () => {
  it('answer all three kinds', () => {
    for (const kind of KINDS) {
      const { result, unmount } = renderHook(() => useLoop(kind, 800));
      expect(result.current).not.toBeNull();
      unmount();
      expect(webLoop(kind, 800)).not.toBeNull();
    }
  });

  it('agree that inactive means null', () => {
    for (const kind of KINDS) {
      const { result } = renderHook(() => useLoop(kind, 800, false));
      expect(result.current).toBeNull();
      expect(webLoop(kind, 800, false)).toBeNull();
    }
  });

  it('default to active, so a caller can omit the flag', () => {
    const { result, unmount } = renderHook(() => useLoop('spin', 800));
    expect(result.current).not.toBeNull();
    unmount();
    expect(webLoop('spin', 800)).not.toBeNull();
  });
});
