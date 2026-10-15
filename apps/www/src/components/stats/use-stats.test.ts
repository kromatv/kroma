// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stats } from '#site/lib/stats';

const fetchStats = vi.hoisted(() => vi.fn<(signal?: AbortSignal) => Promise<Stats>>());

vi.mock('#site/lib/stats', () => ({ fetchStats }));

import { useStats } from './use-stats';

const STATS: Stats = {
  instances: 12,
  clients: { tv: 3, mobile: 4, desktop: 5, total: 12 },
  versions: [{ key: '0.1.40', n: 12 }],
  platforms: [],
  installs: [],
  countries: [],
  locales: [],
  modules: [],
  history: [],
  updatedAt: 1_760_000_000,
};

beforeEach(() => {
  fetchStats.mockResolvedValue(STATS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStats', () => {
  it('starts out loading, so the page never shows a number it has not got', () => {
    const { result } = renderHook(() => useStats());

    expect(result.current).toEqual({ kind: 'loading' });
  });

  it('reads the numbers in the browser and stamps the second they arrived', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_760_000_500_400);

    const { result } = renderHook(() => useStats());

    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(result.current).toEqual({ kind: 'ready', stats: STATS, fetchedAt: 1_760_000_500 });
  });

  it('says so when the collector cannot be reached', async () => {
    fetchStats.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useStats());

    await waitFor(() => expect(result.current).toEqual({ kind: 'failed' }));
  });

  it('abandons the read when the page leaves rather than reporting a failure', async () => {
    let refuse: (why: Error) => void = () => {};
    fetchStats.mockReturnValue(
      new Promise((_, reject) => {
        refuse = reject;
      }),
    );
    const { result, unmount } = renderHook(() => useStats());

    unmount();
    refuse(new Error('aborted'));
    await Promise.resolve();

    expect(fetchStats.mock.calls[0]?.[0]?.aborted).toBe(true);
    expect(result.current).toEqual({ kind: 'loading' });
  });
});
