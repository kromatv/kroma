// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLater } from './use-later.hook';

afterEach(() => {
  vi.useRealTimers();
});

describe('useLater', () => {
  it('runs a callback once its time is up', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const { result } = renderHook(() => useLater());

    result.current(run, 1500);
    vi.advanceTimersByTime(1499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(run).toHaveBeenCalledOnce();
  });

  it('drops every callback still waiting when the component unmounts', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const { result, unmount } = renderHook(() => useLater());

    result.current(run, 1500);
    result.current(run, 3000);
    unmount();
    vi.advanceTimersByTime(3000);

    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs a callback that came due before the unmount', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const { result, unmount } = renderHook(() => useLater());

    result.current(run, 100);
    vi.advanceTimersByTime(100);
    unmount();

    expect(run).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hands back the same function on every render', () => {
    const { result, rerender } = renderHook(() => useLater());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
