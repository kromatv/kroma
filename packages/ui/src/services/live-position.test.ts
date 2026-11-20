// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCastPosition } from './cast-position.hook';
import { useLivePosition } from './live-position.hook';

const FRAME_MS = 16;

function mount(position: () => number, durationMs: number) {
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useLivePosition({ position, durationMs });
  });
  return { ...hook, renders: () => renders };
}

function frames(count: number) {
  act(() => {
    vi.advanceTimersByTime(count * FRAME_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the playhead a view draws', () => {
  it('follows frame by frame on a short clip', () => {
    const started = Date.now();
    const { result } = mount(() => Date.now() - started, 12_000);

    frames(10);

    expect(result.current).toBeGreaterThanOrEqual(9 * FRAME_MS);
    expect(result.current).toBeLessThanOrEqual(10 * FRAME_MS);
  });

  it('renders nothing while the playhead is still', () => {
    const { result, renders } = mount(() => 42_000, 600_000);
    const before = renders();

    frames(60);

    expect(result.current).toBe(42_000);
    expect(renders()).toBe(before);
  });

  it('shows a jump on the next frame', () => {
    let at = 60_000;
    const { result } = mount(() => at, 600_000);

    at = 10_000;
    frames(1);

    expect(result.current).toBe(10_000);
  });

  it('is at the start when no television is driven', () => {
    const { result } = renderHook(() => useCastPosition());

    frames(5);

    expect(result.current).toBe(0);
  });
});
