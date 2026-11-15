// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, useCarousel } from '#web/features/catalog/home/use-carousel';

describe('useCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances to the next slide after the hold and wraps at the end', () => {
    const { result } = renderHook(() => useCarousel(3, false));

    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => vi.advanceTimersByTime(HOLD_MS));
    act(() => vi.advanceTimersByTime(HOLD_MS));

    expect(result.current.index).toBe(0);
  });

  it('holds its slide while the pointer or the keyboard rests on it', () => {
    const { result, rerender } = renderHook(({ resting }) => useCarousel(3, resting), {
      initialProps: { resting: true },
    });

    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(result.current.index).toBe(0);
    expect(result.current.running).toBe(false);

    rerender({ resting: false });
    act(() => vi.advanceTimersByTime(HOLD_MS));

    expect(result.current.index).toBe(1);
  });

  it('stays stopped once the viewer pauses it and resumes when they say so', () => {
    const { result } = renderHook(() => useCarousel(3, false));

    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(HOLD_MS * 3));
    expect(result.current.index).toBe(0);
    expect(result.current.stopped).toBe(true);

    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(HOLD_MS));

    expect(result.current.index).toBe(1);
  });

  it('restarts the hold when the viewer pages by hand', () => {
    const { result } = renderHook(() => useCarousel(3, false));

    act(() => vi.advanceTimersByTime(HOLD_MS - 100));
    act(() => result.current.step(1));
    act(() => vi.advanceTimersByTime(HOLD_MS - 100));

    expect(result.current.index).toBe(1);
  });

  it('pages backwards past the first slide to the last', () => {
    const { result } = renderHook(() => useCarousel(4, false));

    act(() => result.current.step(-1));

    expect(result.current.index).toBe(3);
  });

  it('never runs with a single slide', () => {
    const { result } = renderHook(() => useCarousel(1, false));

    act(() => vi.advanceTimersByTime(HOLD_MS * 2));

    expect(result.current.index).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it('follows the slides when there are fewer of them than before', () => {
    const { result, rerender } = renderHook(({ count }) => useCarousel(count, true), {
      initialProps: { count: 5 },
    });
    act(() => result.current.go(4));

    rerender({ count: 2 });

    expect(result.current.index).toBe(1);
  });
});
