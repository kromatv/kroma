// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LoopKind, useLoop } from './loop';
import { useLoop as useLoopWeb } from './loop.web';

const KINDS: LoopKind[] = ['spin', 'sweep', 'pulse', 'blink'];

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
    // Down to the floor and back, each leg half the stated duration.
    const [legs] = sequence.mock.calls[0] ?? [];
    expect(legs).toHaveLength(2);
    unmount();
  });

  it('travels the sweep on `left`, which a percentage transform cannot express', () => {
    const { result, unmount } = renderHook(() => useLoop('sweep', 800));
    const style = result.current as { width: string; left: unknown };
    expect(style.width).toBe('40%');
    expect(style.left).toBeTypeOf('object');
    unmount();
  });

  it('drives the sweep on the JS thread, `left` being no native-driver property', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { unmount } = renderHook(() => useLoop('sweep', 800));
    for (const [, config] of timing.mock.calls) {
      expect(config).toMatchObject({ useNativeDriver: false });
    }
    unmount();
  });

  it('spins in one direction instead, with no sequence', () => {
    const sequence = vi.spyOn(Animated, 'sequence');
    const { unmount } = renderHook(() => useLoop('spin', 800));
    expect(sequence).not.toHaveBeenCalled();
    unmount();
  });

  it('schedules NOTHING while inactive', () => {
    const loop = vi.spyOn(Animated, 'loop');
    const { result } = renderHook(() => useLoop('spin', 800, false));
    expect(result.current).toBeNull();
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
    // The identity is the key into react-native-web's compiled @keyframes registry.
    expect(styleA).toBe(styleB);
  });

  it('carries the duration alongside rather than inside', () => {
    const [, duration] = webLoop('pulse', 1200) as unknown[];
    // An array, not a spread: spreading the registry object into a new one makes
    // it an unknown style the browser ignores.
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
  it('answer every kind', () => {
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
