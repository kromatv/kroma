// @vitest-environment jsdom
import type { TrailerPreparation } from '@kromatv/client/trailers';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrailerPreparation } from './trailer-preparation';

const answers = (...statuses: TrailerPreparation['status'][]) => {
  const queue = [...statuses];
  return vi.fn(async () => ({ status: queue.shift() ?? 'ready' }));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('following a trailer until it plays', () => {
  it('asks again every second while the server prepares it', async () => {
    const prepare = answers('preparing', 'preparing', 'ready');
    const { result } = renderHook(() => useTrailerPreparation(prepare, 'v1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(result.current).toBe('ready');
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it('stops asking once the server says it failed', async () => {
    const prepare = answers('preparing', 'failed');
    const { result } = renderHook(() => useTrailerPreparation(prepare, 'v1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current).toBe('failed');
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('reads a request that never answered as failed', async () => {
    const prepare = vi.fn(async (): Promise<TrailerPreparation> => {
      throw new Error('offline');
    });
    const { result } = renderHook(() => useTrailerPreparation(prepare, 'v1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current).toBe('failed');
  });

  it('stops asking once the player is gone', async () => {
    const prepare = answers('preparing', 'preparing', 'preparing');
    const { unmount } = renderHook(() => useTrailerPreparation(prepare, 'v1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    unmount();
    await vi.advanceTimersByTimeAsync(5000);

    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
