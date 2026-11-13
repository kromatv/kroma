// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
} from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { useScrollOffset } from './use-scroll-offset';

const scrolledTo = (x: number, y: number) =>
  ({ nativeEvent: { contentOffset: { x, y } } }) as NativeSyntheticEvent<NativeScrollEvent>;

type Handler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

describe('useScrollOffset', () => {
  it('reports the offset along its axis to the newest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onOffset }) => useScrollOffset('x', onOffset, null),
      {
        initialProps: { onOffset: first },
      },
    );
    rerender({ onOffset: second });

    (result.current.onScroll as Handler)(scrolledTo(40, 900));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(40);
  });

  it('scrolls with a plain ScrollView when nothing follows the offset', () => {
    const { result } = renderHook(() => useScrollOffset('y', () => {}, null));

    expect(result.current.Scroller).toBe(ScrollView);
  });

  it('moves the value it drives with the scroll, and still reports', () => {
    const offset = new Animated.Value(0);
    const onOffset = vi.fn();
    const { result } = renderHook(() => useScrollOffset('y', onOffset, offset));
    let moved = 0;
    offset.addListener(({ value }) => {
      moved = value;
    });

    (result.current.onScroll as Handler)(scrolledTo(0, 120));

    expect(result.current.Scroller).toBe(Animated.ScrollView);
    expect(moved).toBe(120);
    expect(onOffset).toHaveBeenCalledWith(120);
  });
});
