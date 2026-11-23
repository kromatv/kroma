// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScreenClock } from './screen-clock.hook';

describe('useScreenClock', () => {
  it('reports each new screen once, under its name', () => {
    const onScreen = vi.fn();
    const first = { name: 'home' };
    const { result, rerender } = renderHook(({ screen }) => useScreenClock(screen, onScreen), {
      initialProps: { screen: first },
    });

    act(() => result.current());
    rerender({ screen: { name: 'detail' } });
    rerender({ screen: first });

    expect(onScreen.mock.calls.map(([name]) => name)).toEqual(['tv home', 'tv detail', 'tv home']);
    expect(onScreen.mock.calls.every(([, ms]) => typeof ms === 'number' && ms >= 0)).toBe(true);
  });
});
