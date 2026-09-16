// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVolumeFlash } from './use-volume-flash';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useVolumeFlash', () => {
  it('shows the level a key set and lets it go once the keys stop', () => {
    const { result } = renderHook(() => useVolumeFlash());

    act(() => result.current.show(0.75));
    expect(result.current.flash).toEqual({ kind: 'volume', level: 0.75 });

    act(() => vi.advanceTimersByTime(699));
    expect(result.current.flash).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.flash).toBeNull();
  });

  it('keeps the latest level up while the key repeats', () => {
    const { result } = renderHook(() => useVolumeFlash());

    act(() => result.current.show(0.5));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.show(0.55));
    act(() => vi.advanceTimersByTime(500));

    expect(result.current.flash).toEqual({ kind: 'volume', level: 0.55 });
  });

  it('drops its timer with the player', () => {
    const { result, unmount } = renderHook(() => useVolumeFlash());
    act(() => result.current.show(1));

    unmount();
    act(() => vi.advanceTimersByTime(1000));

    expect(vi.getTimerCount()).toBe(0);
  });
});
