// @vitest-environment jsdom
import type { WatchableStoryboard } from '@kromatv/client/watchable';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOWNLOAD, TARGET } from './watch.fixture';
import { useWatchStoryboard } from './watch-storyboard';

const sheet = (over: Partial<WatchableStoryboard> = {}): WatchableStoryboard => ({
  url: 'http://kroma.test/sheet.jpg?t=tok_1&v=1',
  interval: 10,
  tileW: 160,
  tileH: 90,
  cols: 2,
  rows: 2,
  count: 4,
  duration: 40,
  complete: false,
  ready: '1100',
  ...over,
});

type Answer = WatchableStoryboard | 'pending' | null;

function stub(...answers: Answer[]) {
  let asked = 0;
  const storyboard = vi.fn(
    async (): Promise<Answer> => answers[Math.min(asked++, answers.length - 1)] ?? null,
  );
  return { watchable: { storyboard }, storyboard };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the sheet of the file being watched', () => {
  it('reads the sheet as far as it is drawn, for the file the target names', async () => {
    const { watchable, storyboard } = stub(sheet());

    const { result } = renderHook(() => useWatchStoryboard({ watchable, target: TARGET }));
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current).toEqual(sheet());
    expect(storyboard).toHaveBeenCalledWith(DOWNLOAD, 5);
  });

  it('is nothing while the module has not begun the sheet', async () => {
    const { watchable, storyboard } = stub('pending');

    const { result } = renderHook(() => useWatchStoryboard({ watchable, target: TARGET }));
    await waitFor(() => expect(storyboard).toHaveBeenCalled());

    expect(result.current).toBeNull();
  });

  it('is asked for again every ten seconds while tiles are being drawn', async () => {
    vi.useFakeTimers();
    const { watchable, storyboard } = stub('pending', sheet({ ready: '1000' }), sheet());

    renderHook(() => useWatchStoryboard({ watchable, target: TARGET }));
    await vi.advanceTimersByTimeAsync(20_100);

    expect(storyboard).toHaveBeenCalledTimes(3);
  });

  it('is not asked for again once the sheet is complete', async () => {
    vi.useFakeTimers();
    const { watchable, storyboard } = stub(sheet(), sheet({ complete: true, ready: '1111' }));

    renderHook(() => useWatchStoryboard({ watchable, target: TARGET }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(storyboard).toHaveBeenCalledTimes(2);
  });

  it('is not asked for again where the module offers no sheet', async () => {
    vi.useFakeTimers();
    const { watchable, storyboard } = stub(null);

    renderHook(() => useWatchStoryboard({ watchable, target: TARGET }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(storyboard).toHaveBeenCalledTimes(1);
  });
});
