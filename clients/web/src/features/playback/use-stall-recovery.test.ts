// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeVideo } from '#web/features/playback/fake-video.fixture';
import {
  type StallRecoveryOptions,
  useStallRecovery,
} from '#web/features/playback/use-stall-recovery';
import type { HlsInstance, ShakaPlayerLike } from '#web/features/playback/video-engine';

const POLL_MS = 500;
const RUNG_MS = 2000;
const WHOLE_LADDER_MS = 12_000;
const BASE_SEC = 1000;

function harness(over: Partial<StallRecoveryOptions> = {}) {
  const fv = fakeVideo({ currentTime: 100, paused: false, readyState: 4 });
  fv.setBuffered([[90, 160]]);
  const shaka = { retryStreaming: vi.fn(() => true) } as unknown as ShakaPlayerLike;
  const hls = { recoverMediaError: vi.fn() } as unknown as HlsInstance;
  const onRestart = vi.fn();
  const opts: StallRecoveryOptions = {
    videoRef: { current: fv.el },
    hlsRef: { current: hls },
    shakaRef: { current: shaka },
    baseSec: BASE_SEC,
    active: true,
    onRestart,
    ...over,
  };
  return { fv, shaka, hls, onRestart, opts };
}

describe('useStallRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nudges a playhead that stopped with buffer still ahead of it', () => {
    const { fv, opts } = harness();

    const { result } = renderHook(() => useStallRecovery(opts));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS + POLL_MS);
    });

    expect(fv.get('currentTime')).toBeCloseTo(100.1, 5);
    expect(result.current).toBe(true);
  });

  it('climbs to Shaka retrying the stream, then to a fresh source', () => {
    const { shaka, hls, onRestart, opts } = harness();

    renderHook(() => useStallRecovery(opts));
    act(() => {
      vi.advanceTimersByTime(WHOLE_LADDER_MS);
    });

    expect(shaka.retryStreaming).toHaveBeenCalledTimes(1);
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onRestart.mock.calls[0]?.[0]).toBeCloseTo(BASE_SEC + 100.2, 5);
  });

  it('recovers through hls.js where Shaka is not the engine', () => {
    const { hls, opts } = harness({ shakaRef: { current: null } });

    renderHook(() => useStallRecovery(opts));
    act(() => {
      vi.advanceTimersByTime(WHOLE_LADDER_MS);
    });

    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
  });

  it('survives a direct-play element with neither engine attached', () => {
    const { onRestart, opts } = harness({
      shakaRef: { current: null },
      hlsRef: { current: null },
    });

    renderHook(() => useStallRecovery(opts));
    act(() => {
      vi.advanceTimersByTime(WHOLE_LADDER_MS);
    });

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('restarts once inside the cooldown, however often it stalls again', () => {
    const { fv, onRestart, opts } = harness();

    renderHook(() => useStallRecovery(opts));
    act(() => {
      vi.advanceTimersByTime(WHOLE_LADDER_MS);
    });
    act(() => {
      fv.set('currentTime', 120);
      vi.advanceTimersByTime(POLL_MS);
      fv.set('currentTime', 125);
      vi.advanceTimersByTime(POLL_MS);
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('leaves alone anything that is not meant to be advancing', () => {
    for (const state of [{ paused: true }, { ended: true }, { seeking: true }, { readyState: 2 }]) {
      const { fv, opts } = harness();
      for (const [key, value] of Object.entries(state)) fv.set(key, value);

      const { result } = renderHook(() => useStallRecovery(opts));
      act(() => {
        vi.advanceTimersByTime(RUNG_MS * 4);
      });

      expect(fv.get('currentTime')).toBe(100);
      expect(result.current).toBe(false);
    }
  });

  it('leaves a playhead that has genuinely run out to the engine', () => {
    const { fv, opts } = harness();
    fv.setBuffered([[90, 100.2]]);

    const { result } = renderHook(() => useStallRecovery(opts));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(fv.get('currentTime')).toBe(100);
    expect(result.current).toBe(false);
  });

  it('watches nothing while it is not armed, or before an element is mounted', () => {
    const idle = harness({ active: false });
    const bare = harness({ videoRef: { current: null } });

    const idleHook = renderHook(() => useStallRecovery(idle.opts));
    const bareHook = renderHook(() => useStallRecovery(bare.opts));
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(idle.fv.get('currentTime')).toBe(100);
    expect(idleHook.result.current).toBe(false);
    expect(bareHook.result.current).toBe(false);
  });

  it('stops polling once it is unmounted', () => {
    const { fv, opts } = harness();

    const { unmount } = renderHook(() => useStallRecovery(opts));
    unmount();
    act(() => {
      vi.advanceTimersByTime(RUNG_MS * 4);
    });

    expect(fv.get('currentTime')).toBe(100);
  });
});
