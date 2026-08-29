// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ease } from '#ui/lib/ease';
import { useSheetSlide } from './slide';
import { useSheetSlide as useSheetSlideWeb } from './slide.web';

const PARK = 420;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the web half', () => {
  it('transitions transform and NOTHING else, the sheet sitting over a decoding video', () => {
    const { result } = renderHook(() => useSheetSlideWeb(true, PARK));
    const style = result.current as { transitionProperty: string };
    expect(style.transitionProperty).toBe('transform');
  });

  it('travels over the same 340ms, on the same house curve as the native half', () => {
    const { result } = renderHook(() => useSheetSlideWeb(true, PARK));
    const style = result.current as {
      transitionDuration: string;
      transitionTimingFunction: string;
    };
    expect(style.transitionDuration).toBe('340ms');
    expect(style.transitionTimingFunction).toBe(ease.out.css);
  });

  it('parks the sheet by the offset it is given and comes home when it opens', () => {
    const { result, rerender } = renderHook(({ open }) => useSheetSlideWeb(open, PARK), {
      initialProps: { open: false },
    });
    const parked = result.current as { transform: [{ translateY: number }] };
    expect(parked.transform).toEqual([{ translateY: PARK }]);

    rerender({ open: true });

    const home = result.current as { transform: [{ translateY: number }] };
    expect(home.transform).toEqual([{ translateY: 0 }]);
  });

  it('schedules no animation of its own', () => {
    const timing = vi.spyOn(Animated, 'timing');
    renderHook(() => useSheetSlideWeb(false, PARK));
    expect(timing).not.toHaveBeenCalled();
  });
});

describe('the native half', () => {
  it('drives the travel on the UI thread', () => {
    const timing = vi.spyOn(Animated, 'timing');
    renderHook(() => useSheetSlide(true, PARK));
    const [, config] = timing.mock.calls[0] ?? [];
    expect(config).toMatchObject({ toValue: 0, useNativeDriver: true });
  });

  it('travels over the same 340ms, on the same house curve as the web half', () => {
    const timing = vi.spyOn(Animated, 'timing');
    renderHook(() => useSheetSlide(true, PARK));
    const [, config] = timing.mock.calls[0] ?? [];
    expect(config).toMatchObject({ duration: 340, easing: ease.out.native });
  });

  it('hands back a DRIVEN translateY rather than a number', () => {
    const { result } = renderHook(() => useSheetSlide(false, PARK));
    const style = result.current as { transform: [{ translateY: unknown }] };
    expect(style.transform).toHaveLength(1);
    expect(style.transform[0].translateY).toBeTypeOf('object');
  });

  it('runs the travel the other way when the sheet closes', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { rerender } = renderHook(({ open }) => useSheetSlide(open, PARK), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    const [, config] = timing.mock.calls.at(-1) ?? [];
    expect(config).toMatchObject({ toValue: 1 });
  });

  it('stops the travel on unmount, so a torn-down player animates nothing', () => {
    const timing = vi.spyOn(Animated, 'timing');
    const { unmount } = renderHook(() => useSheetSlide(true, PARK));
    const anim = timing.mock.results[0]?.value as { stop: () => void };
    const stop = vi.spyOn(anim, 'stop');
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});

const travel = (style: unknown) =>
  (style as { transform: [{ translateY: number }] }).transform[0].translateY;

const drivenTravel = (style: unknown) =>
  (style as { transform: [{ translateY: { __getValue(): number } }] }).transform[0].translateY;

describe('the two halves together', () => {
  it('park the sheet at the same offset', () => {
    const { result: web } = renderHook(() => useSheetSlideWeb(false, PARK));
    const { result: native } = renderHook(() => useSheetSlide(false, PARK));

    expect(travel(web.current)).toBe(PARK);
    expect(drivenTravel(native.current).__getValue()).toBe(PARK);
  });
});
