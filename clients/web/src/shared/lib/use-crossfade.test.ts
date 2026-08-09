// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CROSSFADE_MS, useCrossfade } from './use-crossfade';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCrossfade', () => {
  it('has nothing to fade out on the first render', () => {
    expect(renderHook(() => useCrossfade('/a.jpg')).result.current).toBeNull();
  });

  it('holds the previous source while the incoming one fades in', () => {
    const { result, rerender } = renderHook(({ src }) => useCrossfade(src), {
      initialProps: { src: '/a.jpg' as string | null },
    });
    rerender({ src: '/b.jpg' });
    expect(result.current).toBe('/a.jpg');
  });

  it('drops it once the fade is over, so the pair stops paying for itself', () => {
    const { result, rerender } = renderHook(({ src }) => useCrossfade(src), {
      initialProps: { src: '/a.jpg' as string | null },
    });
    rerender({ src: '/b.jpg' });
    act(() => void vi.advanceTimersByTime(CROSSFADE_MS - 1));
    expect(result.current).toBe('/a.jpg');
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBeNull();
  });

  it('honours a duration the caller sets', () => {
    const { result, rerender } = renderHook(({ src }) => useCrossfade(src, 100), {
      initialProps: { src: '/a.jpg' as string | null },
    });
    rerender({ src: '/b.jpg' });
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current).toBeNull();
  });

  it('re-rendering with an unchanged source starts no fade', () => {
    const { result, rerender } = renderHook(({ src }) => useCrossfade(src), {
      initialProps: { src: '/a.jpg' as string | null },
    });
    rerender({ src: '/a.jpg' });
    rerender({ src: '/a.jpg' });
    expect(result.current).toBeNull();
  });

  it('restarts the hold when a third source lands mid-fade', () => {
    // The pending timer belonged to the previous pair; letting it run would
    // clear the outgoing image half way through the NEW fade.
    const { result, rerender } = renderHook(({ src }) => useCrossfade(src), {
      initialProps: { src: '/a.jpg' as string | null },
    });
    rerender({ src: '/b.jpg' });
    act(() => void vi.advanceTimersByTime(CROSSFADE_MS - 50));
    rerender({ src: '/c.jpg' });
    expect(result.current).toBe('/b.jpg');
    act(() => void vi.advanceTimersByTime(CROSSFADE_MS - 1));
    expect(result.current).toBe('/b.jpg');
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBeNull();
  });

  it('fades out to nothing when the art goes away', () => {
    const { result, rerender } = renderHook(({ src }) => useCrossfade(src), {
      initialProps: { src: '/a.jpg' as string | null },
    });
    rerender({ src: null });
    expect(result.current).toBe('/a.jpg');
  });
});
