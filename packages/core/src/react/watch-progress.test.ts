// @vitest-environment jsdom
import type { WatchableProgress } from '@kromatv/client/watchable';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchableTarget } from '../watchable';
import { arrived, ELSEWHERE, TARGET } from './watch.fixture';
import { useWatchProgress } from './watch-progress';

function stub(answer: () => Promise<WatchableProgress> = async () => arrived()) {
  const progress = vi.fn(answer);
  return { watchable: { progress }, progress };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useWatchProgress', () => {
  it('answers nothing until the server first does', async () => {
    const { watchable } = stub();

    const { result } = renderHook(() =>
      useWatchProgress({ watchable, target: TARGET, everyMs: 1_000 }),
    );

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(arrived()));
  });

  it('asks again on every beat, for the file the target names', async () => {
    vi.useFakeTimers();
    const { watchable, progress } = stub();

    renderHook(() => useWatchProgress({ watchable, target: TARGET, everyMs: 1_000 }));
    await vi.advanceTimersByTimeAsync(3_100);

    expect(progress).toHaveBeenCalledTimes(4);
    expect(progress).toHaveBeenCalledWith(TARGET.entry.id, 5, 120);
  });

  it('asks nothing at all with no file to follow', () => {
    const { watchable, progress } = stub();

    renderHook(() => useWatchProgress({ watchable, target: null, everyMs: 1_000 }));

    expect(progress).not.toHaveBeenCalled();
  });

  it('keeps asking and holds the last figures when an answer is refused', async () => {
    vi.useFakeTimers();
    let asked = 0;
    const { watchable, progress } = stub(async () => {
      asked += 1;
      if (asked > 1) throw new Error('503');
      return arrived();
    });

    const { result } = renderHook(() =>
      useWatchProgress({ watchable, target: TARGET, everyMs: 1_000 }),
    );
    await vi.advanceTimersByTimeAsync(2_100);

    expect(progress).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual(arrived());
  });

  it('blanks the figures the moment another file is followed', async () => {
    const { watchable } = stub();

    const { result, rerender } = renderHook(
      (target: WatchableTarget) => useWatchProgress({ watchable, target, everyMs: 1_000 }),
      { initialProps: TARGET },
    );
    await waitFor(() => expect(result.current).toEqual(arrived()));
    rerender(ELSEWHERE);

    expect(result.current).toBeNull();
  });

  it('stops asking once the screen is gone', async () => {
    vi.useFakeTimers();
    const { watchable, progress } = stub();

    const { unmount } = renderHook(() =>
      useWatchProgress({ watchable, target: TARGET, everyMs: 1_000 }),
    );
    await vi.advanceTimersByTimeAsync(1_100);
    unmount();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(progress).toHaveBeenCalledTimes(2);
  });
});
