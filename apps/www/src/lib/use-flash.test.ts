// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFlash } from './use-flash.hook';

afterEach(() => {
  vi.useRealTimers();
});

describe('useFlash', () => {
  it('holds a value for its time, then lets it go', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFlash<'page'>(1600));

    act(() => result.current[1]('page'));
    expect(result.current[0]).toBe('page');
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(result.current[0]).toBeUndefined();
  });

  it('leaves no timer behind when it unmounts first', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useFlash<'page'>(1600));

    act(() => result.current[1]('page'));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
