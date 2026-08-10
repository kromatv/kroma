// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { LayoutChangeEvent } from 'react-native';
import { describe, expect, it } from 'vitest';
import { useDragTrack } from './useDragTrack';

const laidOutAt = (width: number) =>
  ({ nativeEvent: { layout: { width } } }) as unknown as LayoutChangeEvent;

const measuring = (screenWidth: () => number) =>
  ({
    measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) =>
      cb(0, 0, screenWidth(), 12),
  }) as never;

describe('useDragTrack', () => {
  it('has nothing to convert before the track has been laid out', () => {
    const { result } = renderHook(() => useDragTrack());
    expect(result.current.width).toBe(0);
    expect(result.current.offsetOf(100)).toBeNull();
  });

  it('assumes the two spaces match on a target that reports no box', () => {
    const { result } = renderHook(() => useDragTrack());
    act(() => result.current.onLayout(laidOutAt(1600)));
    expect(result.current.width).toBe(1600);
    expect(result.current.offsetOf(400)).toBe(400);
  });

  it('converts a pointer offset through the canvas-to-screen ratio', () => {
    const { result } = renderHook(() => useDragTrack());
    result.current.ref.current = measuring(() => 800);
    act(() => result.current.onLayout(laidOutAt(1600)));
    expect(result.current.offsetOf(400)).toBe(800);
    expect(result.current.offsetOf(0)).toBe(0);
  });

  it('re-measures on demand, because the stage may have been resized since', () => {
    let onScreen = 800;
    const { result } = renderHook(() => useDragTrack());
    result.current.ref.current = measuring(() => onScreen);
    act(() => result.current.onLayout(laidOutAt(1600)));

    onScreen = 1600;
    act(() => result.current.measure());
    expect(result.current.offsetOf(400)).toBe(400);
  });

  it('a layout pass that reports the same width leaves the width alone', () => {
    const { result } = renderHook(() => useDragTrack());
    act(() => result.current.onLayout(laidOutAt(1600)));
    act(() => result.current.onLayout(laidOutAt(1600)));
    expect(result.current.width).toBe(1600);
  });

  it('has nothing to convert once the track is laid out at no width at all', () => {
    const { result } = renderHook(() => useDragTrack());
    act(() => result.current.onLayout(laidOutAt(0)));
    expect(result.current.offsetOf(400)).toBeNull();
  });
});
