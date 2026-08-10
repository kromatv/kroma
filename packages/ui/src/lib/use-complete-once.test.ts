// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompleteOnce } from './use-complete-once';

describe('useCompleteOnce', () => {
  it('fires on the character that fills the buffer, and not again', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useCompleteOnce(4, onComplete));

    result.current('12');
    expect(onComplete).not.toHaveBeenCalled();

    result.current('1234');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('1234');

    result.current('1234');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('re-arms once the buffer drops below the length', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useCompleteOnce(4, onComplete));

    result.current('1234');
    result.current('123');
    result.current('1235');
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith('1235');
  });

  it('keeps one identity across a re-render with a fresh callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useCompleteOnce(4, cb), {
      initialProps: { cb: first },
    });
    const report = result.current;

    rerender({ cb: second });
    expect(result.current).toBe(report);

    report('1234');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('1234');
  });

  it('is inert without a callback', () => {
    const { result } = renderHook(() => useCompleteOnce(2));
    expect(() => result.current('12')).not.toThrow();
  });
});
