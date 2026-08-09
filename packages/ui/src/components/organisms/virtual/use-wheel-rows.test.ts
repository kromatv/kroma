// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { SpatialNavigationVirtualizedListRef } from 'react-tv-space-navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWheelScroll } from './use-wheel-rows';

let pan: ((delta: number) => void) | null = null;
vi.mock('#ui/lib/wheel-pan', () => ({
  useWheelTravel: (_viewport: unknown, handler: (delta: number) => void) => {
    pan = handler;
  },
}));

const PITCH = 100;
const SNAP_AFTER_MS = 160;

function listRef(focused = 0) {
  const focus = vi.fn();
  const ref = {
    current: { currentlyFocusedItemIndex: focused, focus },
  } as unknown as RefObject<SpatialNavigationVirtualizedListRef | null>;
  return { ref, focus };
}

const viewport = { current: null } as RefObject<View | null>;

// Not wrapped in act(): the hook writes from the handler, and the assertions
// read the ref-driven maths through the returned fraction after a render.
function wheel(delta: number) {
  if (!pan) throw new Error('the hook never registered a wheel handler');
  pan(delta);
}

beforeEach(() => {
  pan = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWheelScroll', () => {
  it('reports no fraction until a wheel actually turns', () => {
    const { ref } = listRef();
    const { result } = renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));
    expect(result.current).toBeNull();
  });

  it('moves the strip 1:1 with the input, without banking', () => {
    const { ref } = listRef();
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));

    wheel(PITCH / 2);
    rerender();
    expect(result.current).toBeCloseTo(0.5, 5);
  });

  it('accumulates across events rather than restarting each time', () => {
    const { ref } = listRef();
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));
    wheel(PITCH);
    wheel(PITCH);
    rerender();
    expect(result.current).toBeCloseTo(2, 5);
  });

  it('picks up from wherever the selection already is', () => {
    const { ref } = listRef(4);
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));
    wheel(PITCH);
    rerender();
    expect(result.current).toBeCloseTo(5, 5);
  });

  it('clamps at the ends instead of running off the list', () => {
    const { ref } = listRef();
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 3, 0, PITCH));

    wheel(-PITCH * 10);
    rerender();
    expect(result.current).toBe(0);

    wheel(PITCH * 100);
    rerender();
    expect(result.current).toBe(3);
  });

  it('folds a header row into the last index', () => {
    const { ref } = listRef();
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 3, 1, PITCH));
    wheel(PITCH * 100);
    rerender();
    // The header occupies list row 0, so the last content row is index 4.
    expect(result.current).toBe(4);
  });

  it('keeps focus following the viewport as rows are crossed', () => {
    const { ref, focus } = listRef();
    renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));

    // Under half a row: nearest is still 0, so nothing to re-focus.
    wheel(PITCH * 0.4);
    expect(focus).not.toHaveBeenCalled();

    wheel(PITCH * 0.3);
    expect(focus).toHaveBeenCalledWith(1);
  });

  it('does not re-focus a row it is already on', () => {
    const { ref, focus } = listRef();
    renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));
    wheel(PITCH);
    expect(focus).toHaveBeenCalledTimes(1);
    wheel(PITCH * 0.1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('snaps when the wheel stops, handing the transform back to the row', () => {
    const { ref, focus } = listRef();
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));

    wheel(PITCH * 1.4);
    rerender();
    expect(result.current).toBeCloseTo(1.4, 5);

    vi.advanceTimersByTime(SNAP_AFTER_MS);
    rerender();
    // null re-enables the row transition, and that glide is the snap.
    expect(result.current).toBeNull();
    expect(focus).toHaveBeenLastCalledWith(1);
  });

  it('defers the snap while the wheel is still turning', () => {
    const { ref } = listRef();
    const { result, rerender } = renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));

    wheel(PITCH);
    vi.advanceTimersByTime(SNAP_AFTER_MS - 20);
    // An inertia tail's sparse events must not each trigger their own snap.
    wheel(PITCH);
    vi.advanceTimersByTime(SNAP_AFTER_MS - 20);
    rerender();
    expect(result.current).not.toBeNull();

    vi.advanceTimersByTime(SNAP_AFTER_MS);
    rerender();
    expect(result.current).toBeNull();
  });

  it('settles on the nearest row when the gesture ends mid-row', () => {
    const { ref, focus } = listRef();
    renderHook(() => useWheelScroll(viewport, ref, 9, 0, PITCH));

    // 2.6 rows: nearest is 3, not the last row crossed.
    wheel(PITCH * 2.6);
    vi.advanceTimersByTime(SNAP_AFTER_MS);
    expect(focus).toHaveBeenLastCalledWith(3);
  });
});
