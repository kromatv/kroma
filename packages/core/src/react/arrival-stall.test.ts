// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArrivalStallSample } from '../watchable-stall';
import { useArrivalStall } from './arrival-stall';

const STUCK: ArrivalStallSample = {
  atSec: 117,
  bufferedSec: 119,
  wanted: true,
  waiting: true,
  failed: false,
  started: true,
  arrived: [[0, 190]],
  durationSec: 658,
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useArrivalStall', () => {
  it('opens the stream again at the playhead once the film under it has sat on disk', () => {
    const onReopen = vi.fn();

    renderHook(() => useArrivalStall(() => STUCK, onReopen));
    act(() => vi.advanceTimersByTime(10_000));

    expect(onReopen).toHaveBeenCalledExactlyOnceWith('reload', 117);
  });

  it('reads the latest render, not the one it started on', () => {
    const onReopen = vi.fn();
    const edge = { ...STUCK, arrived: [[0, 120]] as const };

    const { rerender } = renderHook(({ sample }) => useArrivalStall(() => sample, onReopen), {
      initialProps: { sample: edge as ArrivalStallSample },
    });
    act(() => vi.advanceTimersByTime(20_000));
    rerender({ sample: STUCK });
    act(() => vi.advanceTimersByTime(8_000));

    expect(onReopen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2_000));
    expect(onReopen).toHaveBeenCalledExactlyOnceWith('reload', 117);
  });

  it('reads what the player has loaded on every tick, with no render in between', () => {
    const onReopen = vi.fn();
    let loaded = 119;

    renderHook(() => useArrivalStall(() => ({ ...STUCK, bufferedSec: loaded }), onReopen));
    for (let tick = 0; tick < 30; tick++) {
      loaded += 0.5;
      act(() => vi.advanceTimersByTime(1_000));
    }

    expect(onReopen).not.toHaveBeenCalled();
  });

  it('stops watching once the player is gone', () => {
    const onReopen = vi.fn();

    const { unmount } = renderHook(() => useArrivalStall(() => STUCK, onReopen));
    unmount();
    act(() => vi.advanceTimersByTime(20_000));

    expect(onReopen).not.toHaveBeenCalled();
  });
});
