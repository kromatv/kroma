// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGrowingCount } from './use-growing-count';

describe('useGrowingCount', () => {
  it('starts at one chunk, or the whole list when it is shorter', () => {
    expect(renderHook(() => useGrowingCount(1000, 120)).result.current.count).toBe(120);
    expect(renderHook(() => useGrowingCount(30, 120)).result.current.count).toBe(30);
  });

  it('marks the tail of the rendered chunk, and nothing before it', () => {
    const { result } = renderHook(() => useGrowingCount(1000, 120));
    expect(result.current.isNearEnd(0)).toBe(false);
    expect(result.current.isNearEnd(80)).toBe(false);
    // The look-ahead is a quarter of the chunk: the last 30 of the 120 rendered.
    expect(result.current.isNearEnd(90)).toBe(true);
    expect(result.current.isNearEnd(119)).toBe(true);
  });

  it('looks ahead by at least two, so a small chunk still grows in time', () => {
    // A rail renders eight tiles; a quarter of that is two.
    const { result } = renderHook(() => useGrowingCount(40, 8));
    expect(result.current.isNearEnd(5)).toBe(false);
    expect(result.current.isNearEnd(6)).toBe(true);
  });

  it('adds a chunk when asked, and moves the trigger along with it', () => {
    const { result } = renderHook(() => useGrowingCount(1000, 120));
    act(() => result.current.grow());
    expect(result.current.count).toBe(240);
    expect(result.current.isNearEnd(119)).toBe(false);
    expect(result.current.isNearEnd(239)).toBe(true);
  });

  it('never overshoots the total', () => {
    const { result } = renderHook(() => useGrowingCount(150, 120));
    act(() => result.current.grow());
    expect(result.current.count).toBe(150);
    act(() => result.current.grow());
    expect(result.current.count).toBe(150);
  });

  it('restarts from the first chunk when the list is replaced', () => {
    const { result, rerender } = renderHook(({ total }) => useGrowingCount(total, 120), {
      initialProps: { total: 1000 },
    });
    act(() => result.current.grow());
    expect(result.current.count).toBe(240);
    rerender({ total: 42 });
    expect(result.current.count).toBe(42);
  });
});
