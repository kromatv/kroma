// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelBuild } from './channels';
import { fetchLatestDownloads } from './live-downloads';
import { useCanaryDownloads } from './use-canary-downloads';

vi.mock('./live-downloads', () => ({ fetchLatestDownloads: vi.fn() }));

const baked: ChannelBuild[] = [
  { version: '0.1.40', builtAt: '2026-10-20T12:00:00Z', downloads: [] },
];
const fresh: ChannelBuild[] = [
  { version: '0.1.41', builtAt: '2026-10-28T12:00:00Z', downloads: [] },
];

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});

function pendingBuilds() {
  let resolve!: (value: ChannelBuild[]) => void;
  const promise = new Promise<ChannelBuild[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useCanaryDownloads', () => {
  it('keeps the baked files until the canary channel is selected and refreshed', async () => {
    vi.mocked(fetchLatestDownloads).mockResolvedValue(fresh);
    const { result, rerender } = renderHook(({ enabled }) => useCanaryDownloads(baked, enabled), {
      initialProps: { enabled: false },
    });
    expect(result.current).toBe(baked);
    expect(fetchLatestDownloads).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current).toBe(fresh));
  });

  it('preserves baked links when the refresh has no usable files', async () => {
    vi.mocked(fetchLatestDownloads).mockResolvedValue([]);
    const { result } = renderHook(() => useCanaryDownloads(baked, true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(baked);
  });

  it('aborts a pending refresh when the channel is deselected', async () => {
    const response = pendingBuilds();
    vi.mocked(fetchLatestDownloads).mockReturnValue(response.promise);
    const { result, rerender } = renderHook(({ enabled }) => useCanaryDownloads(baked, enabled), {
      initialProps: { enabled: true },
    });
    const signal = vi.mocked(fetchLatestDownloads).mock.calls[0]?.[0];
    rerender({ enabled: false });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      response.resolve(fresh);
    });
    expect(result.current).toBe(baked);
  });

  it('times out a slow refresh and keeps the baked files', async () => {
    vi.useFakeTimers();
    const response = pendingBuilds();
    vi.mocked(fetchLatestDownloads).mockReturnValue(response.promise);
    const { result } = renderHook(() => useCanaryDownloads(baked, true));
    const signal = vi.mocked(fetchLatestDownloads).mock.calls[0]?.[0];
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      response.resolve(fresh);
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current).toBe(baked);
  });
});
