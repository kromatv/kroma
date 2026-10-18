// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QualityProfile } from './rules-schemas';
import { useRankingPreview } from './use-ranking-preview';

const acquisition = { testRules: vi.fn() };

vi.mock('./api', () => ({ useAcquisitionApi: () => acquisition }));

const PROFILE = {
  id: 'p',
  name: 'P',
  tiers: [
    { qualities: ['webdl-2160p'], allowed: true },
    { qualities: ['webdl-1080p'], allowed: true },
    { qualities: ['webdl-720p'], allowed: false },
  ],
  cutoff: 'webdl-1080p',
  upgradesAllowed: true,
  formatScores: { vff: 100 },
} as unknown as QualityProfile;

function view(name: string) {
  const quality = name.includes('2160p') ? 'webdl-2160p' : 'webdl-1080p';
  const formats = name.includes('VFF') ? [{ id: 'vff' }] : [];
  return { profiles: [{ evaluation: { quality, formats } }] };
}

beforeEach(() => {
  vi.useFakeTimers();
  acquisition.testRules
    .mockReset()
    .mockImplementation((name: string) => Promise.resolve(view(name)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a ranking preview', () => {
  it('is busy until the debounce has run and the samples answered', async () => {
    const { result } = renderHook(() => useRankingPreview(PROFILE));

    expect(result.current).toEqual({ busy: true, failed: false, rows: [] });
    expect(acquisition.testRules).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current.busy).toBe(false);
    expect(acquisition.testRules).toHaveBeenCalledTimes(5);
  });

  it('ranks the better quality first, then the higher score', async () => {
    const { result } = renderHook(() => useRankingPreview(PROFILE));

    await act(() => vi.advanceTimersByTimeAsync(400));

    const names = result.current.rows.map((row) => row.name);
    expect(names[0]).toBe('Serie.S01E01.VOSTFR.2160p.WEB-DL.x265-GRP');
    expect(names[1]).toBe('Serie.S01E01.MULTi.VFF.1080p.WEB-DL.x264-GRP');
    expect(result.current.rows[1]?.score).toBe(100);
    expect(result.current.rows[1]?.rank).toBe(1);
  });

  it('sinks a quality the profile does not allow', async () => {
    const profile = {
      ...PROFILE,
      tiers: [{ qualities: ['webdl-2160p'], allowed: true }],
    } as unknown as QualityProfile;
    const { result } = renderHook(() => useRankingPreview(profile));

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current.rows[0]?.rank).toBe(0);
    expect(result.current.rows.at(-1)?.rank).toBeNull();
  });

  it('reads a sample with no verdict as an unknown quality', async () => {
    acquisition.testRules.mockResolvedValue({ profiles: [] });
    const { result } = renderHook(() => useRankingPreview(PROFILE));

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current.rows.every((row) => row.quality === 'unknown')).toBe(true);
  });

  it('reports a failure', async () => {
    acquisition.testRules.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useRankingPreview(PROFILE));

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current).toEqual({ busy: false, failed: true, rows: [] });
  });

  it('asks for nothing when it unmounts before the debounce', () => {
    const { unmount } = renderHook(() => useRankingPreview(PROFILE));

    unmount();
    vi.advanceTimersByTime(400);

    expect(acquisition.testRules).not.toHaveBeenCalled();
  });
});
