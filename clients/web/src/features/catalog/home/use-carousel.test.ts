// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, useCarousel } from '#web/features/catalog/home/use-carousel.hook';

describe('useCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances to the next slide after the hold and wraps at the end', async () => {
    const { result } = renderHook(() => useCarousel(3, { resting: false }));

    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS));
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS));
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS));

    expect(result.current.index).toBe(0);
  });

  it('holds its slide while the pointer or the keyboard rests on it', async () => {
    const { result, rerender } = renderHook(({ resting }) => useCarousel(3, { resting }), {
      initialProps: { resting: true },
    });

    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS * 2));
    expect(result.current.index).toBe(0);
    expect(result.current.running).toBe(false);

    rerender({ resting: false });
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS));

    expect(result.current.index).toBe(1);
  });

  it('stays stopped once the viewer pauses it and resumes when they say so', async () => {
    const { result } = renderHook(() => useCarousel(3, { resting: false }));

    act(() => result.current.toggle());
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS * 3));
    expect(result.current.index).toBe(0);
    expect(result.current.stopped).toBe(true);

    act(() => result.current.toggle());
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS));

    expect(result.current.index).toBe(1);
  });

  it('restarts the hold when the viewer pages by hand', async () => {
    const { result } = renderHook(() => useCarousel(3, { resting: false }));

    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS - 100));
    act(() => result.current.step(1));
    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS - 100));

    expect(result.current.index).toBe(1);
  });

  it('pages backwards past the first slide to the last', async () => {
    const { result } = renderHook(() => useCarousel(4, { resting: false }));

    act(() => result.current.step(-1));

    expect(result.current.index).toBe(3);
  });

  it('never runs with a single slide', async () => {
    const { result } = renderHook(() => useCarousel(1, { resting: false }));

    await act(async () => vi.advanceTimersByTimeAsync(HOLD_MS * 2));

    expect(result.current.index).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it('follows the slides when there are fewer of them than before', async () => {
    const { result, rerender } = renderHook(({ count }) => useCarousel(count, { resting: true }), {
      initialProps: { count: 5 },
    });
    act(() => result.current.go(4));

    rerender({ count: 2 });

    expect(result.current.index).toBe(1);
  });
});
