// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadStatsEvent, DownloadStatsView, SpeedSample } from './schemas';
import { useLiveStats } from './use-live-stats';

let listener: ((e: DownloadStatsEvent) => void) | null = null;

vi.mock('@kroma/module-sdk', () => ({
  useServerEvents: (onEvent: (e: DownloadStatsEvent) => void) => {
    listener = onEvent;
  },
}));

function sample(atMs: number, downBps = 1): SpeedSample {
  return { atMs, downBps, upBps: 0, active: 1, peers: 2 };
}

function polled(history: SpeedSample[] = []): DownloadStatsView {
  return {
    downBps: 100,
    upBps: 10,
    peers: 3,
    active: 1,
    byStatus: { downloading: 1 },
    totalDownloadedBytes: 5_000,
    totalUploadedBytes: 500,
    history,
  };
}

function frame(over: Partial<DownloadStatsEvent> = {}): DownloadStatsEvent {
  return { type: 'downloads.stats', downBps: 900, upBps: 90, active: 4, peers: 40, ...over };
}

function live(view: DownloadStatsView) {
  return renderHook(({ v }) => useLiveStats(v), { initialProps: { v: view } });
}

describe('useLiveStats', () => {
  beforeEach(() => {
    listener = null;
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => vi.useRealTimers());

  it('reads exactly as the poll did until a frame arrives', () => {
    const view = polled([sample(500)]);

    const { result } = live(view);

    expect(result.current).toBe(view);
  });

  it('ignores an event that is not the monitor speaking', () => {
    const view = polled();
    const { result } = live(view);

    act(() => listener?.({ type: 'downloads.other' } as unknown as DownloadStatsEvent));

    expect(result.current).toBe(view);
  });

  it('takes the rates and the counts off the frame', () => {
    const { result } = live(polled());

    act(() => listener?.(frame()));

    expect(result.current.downBps).toBe(900);
    expect(result.current.upBps).toBe(90);
    expect(result.current.active).toBe(4);
    expect(result.current.peers).toBe(40);
  });

  it('leaves the lifetime totals on whatever the poll last said', () => {
    const { result } = live(polled());

    act(() => listener?.(frame()));

    expect(result.current.totalDownloadedBytes).toBe(5_000);
    expect(result.current.totalUploadedBytes).toBe(500);
    expect(result.current.byStatus).toEqual({ downloading: 1 });
  });

  it('extends the polled trace only with frames the poll had not already recorded', () => {
    const { result, rerender } = live(polled());
    act(() => listener?.(frame({ downBps: 111 })));

    vi.setSystemTime(2_000);
    act(() => listener?.(frame({ downBps: 222 })));
    rerender({ v: polled([sample(1_500, 111)]) });

    expect(result.current.history).toEqual([
      sample(1_500, 111),
      { atMs: 2_000, downBps: 222, upBps: 90, active: 4, peers: 40 },
    ]);
  });

  it('keeps the trace to the window the sparkline draws', () => {
    const { result } = live(polled(Array.from({ length: 180 }, (_, i) => sample(i))));

    act(() => listener?.(frame()));

    expect(result.current.history).toHaveLength(180);
    expect(result.current.history.at(-1)?.atMs).toBe(1_000);
  });
});
