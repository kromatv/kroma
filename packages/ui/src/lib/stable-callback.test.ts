// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStableCallback } from './stable-callback';

afterEach(cleanup);

describe('useStableCallback', () => {
  it('hands back one function forever, which is the whole point over useEffectEvent', () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback(() => n), {
      initialProps: { n: 1 },
    });
    const first = result.current;

    rerender({ n: 2 });
    rerender({ n: 3 });

    expect(result.current).toBe(first);
  });

  it('calls the newest render`s closure, not the one it was created with', () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback(() => n), {
      initialProps: { n: 1 },
    });
    const held = result.current;

    rerender({ n: 42 });

    expect(held()).toBe(42);
  });

  it('passes its arguments through and returns what the callee returns', () => {
    const { result } = renderHook(() => useStableCallback((a: number, b: string) => `${b}${a}`));
    let out = '';
    act(() => {
      out = result.current(7, 'k');
    });
    expect(out).toBe('k7');
  });
});
