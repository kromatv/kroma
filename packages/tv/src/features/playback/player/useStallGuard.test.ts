// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TvEngine } from '#tv/features/playback/player/engine';
import { useStallGuard } from '#tv/features/playback/player/useStallGuard';

const POLL_MS = 500;
const RUNG_MS = 2000;

function fakeEngine(over: Partial<Record<string, unknown>> = {}) {
  let at = 100;
  let ahead = 60;
  const engine = {
    kind: 'video',
    position: vi.fn(() => at),
    bufferedEnd: vi.fn((): number | null => at + ahead),
    isPaused: vi.fn(() => false),
    nudge: vi.fn(),
    seekTo: vi.fn(),
    recoverStall: vi.fn(() => true),
    restart: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    duration: vi.fn(() => 7200),
    setAudioRendition: vi.fn(),
    destroy: vi.fn(),
    ...over,
  };
  return {
    engine: engine as unknown as TvEngine,
    calls: engine,
    ref: { current: engine as unknown as TvEngine },
    move: (by: number) => {
      at += by;
    },
    starve: () => {
      ahead = 0.2;
    },
  };
}

describe('useStallGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nudges a playhead that stopped with buffer still ahead of it', () => {
    const f = fakeEngine();

    const { result } = renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS + POLL_MS);
    });

    expect(f.calls.nudge).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it('climbs to the backend recovery, then to a fresh source', () => {
    const f = fakeEngine();

    renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4 + POLL_MS);
    });

    expect(f.calls.nudge).toHaveBeenCalledTimes(2);
    expect(f.calls.recoverStall).toHaveBeenCalledTimes(1);
    expect(f.calls.restart).toHaveBeenCalledWith(100);
  });

  it('goes straight on to a fresh source where the backend has no recovery', () => {
    const f = fakeEngine({ recoverStall: undefined });

    renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 3 + POLL_MS);
    });

    expect(f.calls.restart).toHaveBeenCalledTimes(1);
  });

  it('reaches for a fresh source when the backend recovery declines', () => {
    const f = fakeEngine({ recoverStall: vi.fn(() => false) });

    renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 3 + POLL_MS);
    });

    expect(f.calls.recoverStall).toHaveBeenCalledTimes(1);
    expect(f.calls.restart).toHaveBeenCalledTimes(1);
  });

  it('restarts once inside the cooldown, however often it stalls again', () => {
    const f = fakeEngine();

    renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4 + POLL_MS);
    });
    act(() => {
      f.move(5);
      vi.advanceTimersByTime(POLL_MS);
      f.move(5);
      vi.advanceTimersByTime(POLL_MS);
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(f.calls.restart).toHaveBeenCalledTimes(1);
  });

  it('leaves a paused film alone', () => {
    const f = fakeEngine({ isPaused: vi.fn(() => true) });

    const { result } = renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(f.calls.nudge).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('leaves a playhead that has genuinely run out to the backend', () => {
    const f = fakeEngine();
    f.starve();

    const { result } = renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(f.calls.nudge).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('leaves a backend with no buffered range to report alone', () => {
    const f = fakeEngine({ bufferedEnd: vi.fn(() => null) });

    renderHook(() => useStallGuard(f.ref, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(f.calls.nudge).not.toHaveBeenCalled();
  });

  it('watches nothing while it is not armed, or before an engine exists', () => {
    const f = fakeEngine();
    const empty: { current: TvEngine | null } = { current: null };

    const idle = renderHook(() => useStallGuard(f.ref, false));
    const engineless = renderHook(() => useStallGuard(empty, true));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(f.calls.nudge).not.toHaveBeenCalled();
    expect(idle.result.current).toBe(false);
    expect(engineless.result.current).toBe(false);
  });

  it('stops polling once it is unmounted', () => {
    const f = fakeEngine();

    const { unmount } = renderHook(() => useStallGuard(f.ref, true));
    unmount();
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(f.calls.nudge).not.toHaveBeenCalled();
  });
});
