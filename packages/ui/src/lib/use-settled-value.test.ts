// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettledValue } from './use-settled-value';

const walk = (delayMs = 400) =>
  renderHook(({ value }) => useSettledValue(value, delayMs), { initialProps: { value: 'a' } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useSettledValue', () => {
  it('takes the first value without waiting for it', () => {
    const { result } = walk();

    expect(result.current).toBe('a');
  });

  it('holds the previous value until the new one has stood still for the delay', () => {
    const { result, rerender } = walk();

    rerender({ value: 'b' });

    act(() => vi.advanceTimersByTime(399));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('b');
  });

  it('skips every value a fast walk passed through', () => {
    const { result, rerender } = walk();

    for (const value of ['b', 'c', 'd']) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(120));
    }

    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe('d');
  });

  it('hands over nothing when the walk comes back to where it started', () => {
    const { result, rerender } = walk();

    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'a' });

    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe('a');
  });
});
