// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShake } from './shake';
import { useShake as useShakeWeb } from './shake.web';

type Legs = Animated.CompositeAnimation[];

function legsOf(sequence: ReturnType<typeof vi.spyOn>, call = 0): Legs {
  return (sequence.mock.calls[call]?.[0] ?? []) as Legs;
}

// react-native-web reports "reduce motion" where there is no `matchMedia` to
// ask, which jsdom is, so every test states the preference it is testing under.
function prefers(reduced: boolean): void {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const LEG_MS = 80;

function travelOf(style: unknown): number {
  return (style as { transform: [{ translateX: number }] }).transform[0].translateX;
}

describe('the native half', () => {
  it('schedules nothing before the first refusal', () => {
    prefers(false);
    const sequence = vi.spyOn(Animated, 'sequence');

    const { unmount } = renderHook(() => useShake(0));

    expect(sequence).not.toHaveBeenCalled();
    unmount();
  });

  it('wobbles once per refusal rather than once per render', () => {
    prefers(false);
    const sequence = vi.spyOn(Animated, 'sequence');

    const { rerender, unmount } = renderHook(({ at }) => useShake(at), {
      initialProps: { at: 1 },
    });
    rerender({ at: 1 });
    rerender({ at: 2 });

    expect(sequence).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('travels either side and comes home, so the row cannot stop at an edge', () => {
    prefers(false);
    const sequence = vi.spyOn(Animated, 'sequence');
    const timing = vi.spyOn(Animated, 'timing');

    const { unmount } = renderHook(() => useShake(1));

    expect(legsOf(sequence)).toHaveLength(5);
    const targets = timing.mock.calls.map(([, config]) => config.toValue);
    expect(targets).toEqual([-8, 8, -8, 8, 0]);
    unmount();
  });

  it('drives on the UI thread, which is the reason it is Animated at all', () => {
    prefers(false);
    const timing = vi.spyOn(Animated, 'timing');

    const { unmount } = renderHook(() => useShake(1));

    for (const [, config] of timing.mock.calls) {
      expect(config).toMatchObject({ useNativeDriver: true, duration: 80 });
    }
    unmount();
  });

  it('hands back a DRIVEN translateX rather than a number', () => {
    prefers(false);

    const { result, unmount } = renderHook(() => useShake(1));

    const style = result.current as { transform: [{ translateX: unknown }] };
    expect(style.transform).toHaveLength(1);
    expect(style.transform[0].translateX).toBeTypeOf('object');
    unmount();
  });

  it('holds still for a reader who asked for less motion, travel being the whole effect', async () => {
    prefers(true);
    const sequence = vi.spyOn(Animated, 'sequence');

    const { rerender, unmount } = renderHook(({ at }) => useShake(at), {
      initialProps: { at: 0 },
    });
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    rerender({ at: 1 });

    expect(sequence).not.toHaveBeenCalled();
    unmount();
  });

  it('stops the wobble and returns the row home when it goes away mid-shake', () => {
    prefers(false);
    const sequence = vi.spyOn(Animated, 'sequence');

    const { result, unmount } = renderHook(() => useShake(1));
    const wobble = sequence.mock.results[0]?.value as Animated.CompositeAnimation;
    const stop = vi.spyOn(wobble, 'stop');
    const travel = (result.current as { transform: [{ translateX: Animated.Value }] }).transform[0]
      .translateX;
    unmount();

    expect(stop).toHaveBeenCalled();
    expect(travel).toHaveProperty('_value', 0);
  });
});

describe('the web half', () => {
  it('holds home before the first refusal', () => {
    prefers(false);

    const { result } = renderHook(() => useShakeWeb(0));

    expect(travelOf(result.current)).toBe(0);
  });

  it('walks the same five legs, one 80ms transition each', () => {
    prefers(false);
    vi.useFakeTimers();

    const { result } = renderHook(() => useShakeWeb(1));
    const seen = [travelOf(result.current)];
    for (let leg = 1; leg < 5; leg += 1) {
      act(() => vi.advanceTimersByTime(LEG_MS));
      seen.push(travelOf(result.current));
    }

    expect(seen).toEqual([-8, 8, -8, 8, 0]);
  });

  it('leaves the interpolation to the compositor: transform and nothing else', () => {
    prefers(false);

    const { result } = renderHook(() => useShakeWeb(1));

    // `ease-in-out` is `Easing.inOut(Easing.ease)` in the other dialect, the
    // same pair lib/loop spells for its breathing kinds.
    expect(result.current).toMatchObject({
      transitionProperty: 'transform',
      transitionDuration: `${LEG_MS}ms`,
      transitionTimingFunction: 'ease-in-out',
    });
  });

  it('wobbles once per refusal rather than once per render', () => {
    prefers(false);
    vi.useFakeTimers();

    const { result, rerender } = renderHook(({ at }) => useShakeWeb(at), {
      initialProps: { at: 1 },
    });
    act(() => vi.advanceTimersByTime(LEG_MS));
    rerender({ at: 1 });

    expect(travelOf(result.current)).toBe(8);
  });

  it('holds still for a reader who asked for less motion, travel being the whole effect', async () => {
    prefers(true);

    const { result, rerender } = renderHook(({ at }) => useShakeWeb(at), {
      initialProps: { at: 0 },
    });
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    rerender({ at: 1 });

    expect(travelOf(result.current)).toBe(0);
  });

  it('drops the legs it had not walked yet when it goes away mid-shake', () => {
    prefers(false);
    vi.useFakeTimers();

    const { unmount } = renderHook(() => useShakeWeb(1));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
