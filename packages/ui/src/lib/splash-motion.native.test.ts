// @vitest-environment jsdom
//
// The native half of the splash drift. Two things are pinned, both of them the
// reason this half is written the way it is rather than the obvious way:
//
// the transform array is MEMOISED, because handing <Animated.View> a fresh one
// re-attaches the whole node graph across the bridge, mid-animation, on every
// render of whatever holds the backdrop; and the scale is a plain number rather
// than a third interpolation, because a scale in flight makes the compositor
// re-rasterise a full-screen still on every frame it moves.

import { renderHook } from '@testing-library/react';
import { Animated } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { GRADE, useDrift } from './splash-motion';

const SPEC = { x: 0.04, y: 0.03, zoom: 1.12, ms: 12_000, width: 1000, height: 500 };

function drift(spec = SPEC) {
  return renderHook(({ s }) => useDrift(s), { initialProps: { s: spec } });
}

describe('useDrift (native)', () => {
  it('pans out and back on both axes, in pixels of the measured box', () => {
    const style = drift().result.current as unknown as {
      transform: [
        { translateX: { _config: { outputRange: number[] } } },
        { translateY: { _config: { outputRange: number[] } } },
        { scale: number },
      ];
    };
    // React Native cannot interpret a percentage inside a transform, so the
    // fractions are multiplied out here where the web half leaves them to CSS.
    expect(style.transform[0].translateX._config.outputRange).toEqual([40, -40]);
    expect(style.transform[1].translateY._config.outputRange).toEqual([15, -15]);
    expect(style.transform[2].scale).toBe(1.12);
  });

  it('holds the scale still rather than animating it', () => {
    const style = drift().result.current as unknown as { transform: [unknown, unknown, unknown] };
    // A number, not an interpolation: an animated scale re-rasterises the layer.
    expect(typeof (style.transform[2] as { scale: unknown }).scale).toBe('number');
  });

  it('hands back the SAME transform across a re-render with the same geometry', () => {
    const { result, rerender } = drift();
    const first = result.current;
    rerender({ s: { ...SPEC } });
    expect(result.current).toBe(first);
  });

  it('builds a new one only when the box actually changes', () => {
    const { result, rerender } = drift();
    const first = result.current;
    rerender({ s: { ...SPEC, width: 1200 } });
    expect(result.current).not.toBe(first);
  });

  it('runs the loop while it is mounted and stops it on the way out', () => {
    const stop = vi.fn();
    const start = vi.fn();
    const loop = vi
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start, stop } as unknown as Animated.CompositeAnimation);

    const { unmount } = drift();
    expect(start).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    loop.mockRestore();
  });
});

describe('GRADE (native)', () => {
  it('is nothing: the colour grade is a CSS filter and a panel has none', () => {
    expect(GRADE).toBeNull();
  });
});
