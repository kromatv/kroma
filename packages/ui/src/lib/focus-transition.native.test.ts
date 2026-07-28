// @vitest-environment jsdom
//
// The focus scale and the press dip, on both platforms.
//
// Two findings are encoded here that cost real measurement to establish, and
// both are invisible from the code that calls these hooks.
//
// The first: `to === 1` must produce NO transform at all, not a transform of 1.
// A browse grid holds hundreds of tiles, and a transform on each promotes each
// to its own compositing layer, which a TV GPU pays for even when the value
// changes nothing.
//
// The second: the web half transitions `transform` and nothing else. Measured on
// a Samsung LS03D walking the home rails - transform alone 50fps/14 janky
// frames, transform + box-shadow + background-color 38fps/85. The focus ring is
// the worst case of a non-composited property, drawn outside the box and heavily
// blurred, so each frame of its fade repaints two tiles and the region around
// them. Adding a property to that list is a third of the frame rate, and nothing
// in the diff would say so.

import { act, renderHook } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ease } from './ease';
import { useFocusScale, usePressScale } from './focus-transition';
import {
  useFocusScale as useFocusScaleWeb,
  usePressScale as usePressScaleWeb,
} from './focus-transition.web';
import { motion } from './tokens';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFocusScale on the web', () => {
  it('transitions transform and NOTHING else', () => {
    const { result } = renderHook(() => useFocusScaleWeb(true, 1.08));
    // See the header: box-shadow here was two thirds of the jank on the home
    // screen. The ring does not fade; it is simply there on the frame focus
    // lands.
    expect(result.current.transitionProperty).toBe('transform');
  });

  it('eases with the house curve, over the base duration', () => {
    const { result } = renderHook(() => useFocusScaleWeb(true, 1.08));
    expect(result.current.transitionDuration).toBe(`${motion.duration.base}ms`);
    expect(result.current.transitionTimingFunction).toBe(ease.out.css);
  });

  it('scales to the target while focused and back to 1 when not', () => {
    const { result, rerender } = renderHook(({ on }) => useFocusScaleWeb(on, 1.08), {
      initialProps: { on: false },
    });
    expect(result.current.transform).toEqual([{ scale: 1 }]);
    rerender({ on: true });
    expect(result.current.transform).toEqual([{ scale: 1.08 }]);
  });

  it('gives a ring-only focusable no transform and no transition', () => {
    const { result } = renderHook(() => useFocusScaleWeb(true, 1));
    // Not `scale: 1` - nothing at all, so the tile is never promoted to its own
    // layer. That is hundreds of layers on a browse grid.
    expect(result.current).toEqual({});
  });
});

describe('useFocusScale on native', () => {
  it('drives the scale on the UI thread', () => {
    const timing = vi.spyOn(Animated, 'timing');
    renderHook(() => useFocusScale(true, 1.08));
    expect(timing).toHaveBeenCalledOnce();
    const [, config] = timing.mock.calls[0] ?? [];
    expect(config).toMatchObject({ toValue: 1.08, useNativeDriver: true });
  });

  it('eases with the same house curve and duration as the web', () => {
    const timing = vi.spyOn(Animated, 'timing');
    renderHook(() => useFocusScale(true, 1.08));
    const [, config] = timing.mock.calls[0] ?? [];
    expect(config).toMatchObject({ duration: motion.duration.base, easing: ease.out.native });
  });

  it('returns to 1 when focus leaves', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { rerender } = renderHook(({ on }) => useFocusScale(on, 1.08), {
      initialProps: { on: true },
    });
    rerender({ on: false });
    const [, config] = timing.mock.calls.at(-1) ?? [];
    expect(config).toMatchObject({ toValue: 1 });
  });

  it('runs no animation at all for a ring-only focusable', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { result } = renderHook(() => useFocusScale(true, 1));
    // Skipped entirely rather than run as a no-op timing on every rail tile.
    expect(timing).not.toHaveBeenCalled();
    expect(result.current).toEqual({});
  });

  it('stops the animation on unmount', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { unmount } = renderHook(() => useFocusScale(true, 1.08));
    const anim = timing.mock.results[0]?.value as { stop: () => void };
    const stop = vi.spyOn(anim, 'stop');
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});

describe('usePressScale on the web', () => {
  it('dips to the press scale under the finger and springs back', () => {
    const { result } = renderHook(() => usePressScaleWeb());
    expect(result.current.style.transform).toEqual([{ scale: 1 }]);

    act(() => result.current.onPressIn());
    expect(result.current.pressed).toBe(true);
    expect(result.current.style.transform).toEqual([{ scale: motion.pressScale }]);

    act(() => result.current.onPressOut());
    expect(result.current.pressed).toBe(false);
    expect(result.current.style.transform).toEqual([{ scale: 1 }]);
  });

  it('carries the release overshoot in the bezier, over the fast duration', () => {
    const { result } = renderHook(() => usePressScaleWeb());
    // The dip is immediate feedback, so it is the fast token; the spring curve
    // is what gives the release its life.
    expect(result.current.style.transitionDuration).toBe(`${motion.duration.fast}ms`);
    expect(result.current.style.transitionTimingFunction).toBe(ease.spring.css);
    expect(result.current.style.transitionProperty).toBe('transform');
  });
});

describe('usePressScale on native', () => {
  it('eases the dip fast, and never bounces on the way down', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { result } = renderHook(() => usePressScale());
    act(() => result.current.onPressIn());
    expect(result.current.pressed).toBe(true);
    const [, config] = timing.mock.calls[0] ?? [];
    expect(config).toMatchObject({
      toValue: motion.pressScale,
      duration: motion.duration.fast,
      useNativeDriver: true,
    });
  });

  it('springs back on release, which is where the life is', () => {
    const spring = vi.spyOn(Animated, 'spring');
    const { result } = renderHook(() => usePressScale());
    act(() => result.current.onPressIn());
    act(() => result.current.onPressOut());
    expect(result.current.pressed).toBe(false);
    const [, config] = spring.mock.calls[0] ?? [];
    // Bounciness is the overshoot: a timing back to 1 would feel dead.
    expect(config).toMatchObject({ toValue: 1, bounciness: 9, useNativeDriver: true });
  });
});

describe('the two halves together', () => {
  it('agree that a ring-only focusable gets an empty style', () => {
    const { result: native } = renderHook(() => useFocusScale(true, 1));
    const { result: web } = renderHook(() => useFocusScaleWeb(true, 1));
    expect(native.current).toEqual({});
    expect(web.current).toEqual({});
  });

  it('give the press dip the same shape, so a control needs no platform check', () => {
    const { result: native } = renderHook(() => usePressScale());
    const { result: web } = renderHook(() => usePressScaleWeb());
    expect(Object.keys(native.current).sort()).toEqual(Object.keys(web.current).sort());
    expect(native.current.pressed).toBe(web.current.pressed);
  });
});
