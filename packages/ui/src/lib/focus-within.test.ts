// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusWithin } from './focus-within.hook';

describe('useFocusWithin', () => {
  it('starts unfocused', () => {
    const { result } = renderHook(() => useFocusWithin());

    expect(result.current.focused).toBe(false);
  });

  it('reads focused once the control takes the focus', () => {
    const { result } = renderHook(() => useFocusWithin());

    act(() => result.current.onFocus());

    expect(result.current.focused).toBe(true);
  });

  it('reads unfocused again once the control loses it', () => {
    const { result } = renderHook(() => useFocusWithin());
    act(() => result.current.onFocus());

    act(() => result.current.onBlur());

    expect(result.current.focused).toBe(false);
  });

  it('passes each event on to the caller handler', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { result } = renderHook(() => useFocusWithin(onFocus, onBlur));

    act(() => {
      result.current.onFocus();
      result.current.onBlur();
    });

    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });
});
