// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDeviceStore } from '#ui/lib/device-store';
import { keepWatchPosition, useRememberWatchPosition, watchResumeAt } from './watch-resume';

const FILM = 'e0d1521ed289ba35:0';

let kept: Record<string, string>;

beforeEach(() => {
  kept = {};
  setDeviceStore({
    getItem: (key) => kept[key] ?? null,
    setItem: (key, value) => {
      kept[key] = value;
    },
    removeItem: (key) => {
      delete kept[key];
    },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setDeviceStore(null);
});

describe('where a device remembers a watch it has no catalogue row for', () => {
  it('opens at the start for a file it has never played', () => {
    expect(watchResumeAt(FILM)).toBe(0);
  });

  it('gives back the position the player last held', () => {
    const { unmount } = renderHook(() => useRememberWatchPosition(FILM, 640, 6_000));

    unmount();

    expect(watchResumeAt(FILM)).toBe(640);
  });

  it('keeps writing while the player stays up', () => {
    const { rerender } = renderHook(({ at }) => useRememberWatchPosition(FILM, at, 6_000), {
      initialProps: { at: 640 },
    });

    rerender({ at: 900 });
    vi.advanceTimersByTime(10_000);

    expect(watchResumeAt(FILM)).toBe(900);
  });

  it('leaves the saved position alone while the picture has not started', () => {
    renderHook(() => useRememberWatchPosition(FILM, 640, 6_000)).unmount();

    const slow = renderHook(() => useRememberWatchPosition(FILM, 0, 6_000));
    vi.advanceTimersByTime(10_000);
    slow.unmount();

    expect(watchResumeAt(FILM)).toBe(640);
  });

  it('writes again as soon as the picture reports a time', () => {
    renderHook(() => useRememberWatchPosition(FILM, 640, 6_000)).unmount();

    const { rerender, unmount } = renderHook(
      ({ at }) => useRememberWatchPosition(FILM, at, 6_000),
      {
        initialProps: { at: 0 },
      },
    );
    rerender({ at: 120 });
    unmount();

    expect(watchResumeAt(FILM)).toBe(120);
  });

  it('forgets a film watched to its end rather than reopening it there', () => {
    const { rerender, unmount } = renderHook(
      ({ at }) => useRememberWatchPosition(FILM, at, 6_000),
      { initialProps: { at: 640 } },
    );
    vi.advanceTimersByTime(10_000);

    rerender({ at: 5_900 });
    unmount();

    expect(watchResumeAt(FILM)).toBe(0);
  });
});

describe('handing a position over to the next player on this device', () => {
  it('is where that player resumes', () => {
    keepWatchPosition(FILM, 420, 900);

    expect(watchResumeAt(FILM)).toBe(420);
  });
});
