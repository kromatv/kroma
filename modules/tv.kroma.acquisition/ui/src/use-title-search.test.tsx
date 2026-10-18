// @vitest-environment jsdom
import { IndexerId, type ScoredReleaseView } from '@kromatv/client/requests';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTitleSearch } from './use-title-search';

const acquisition = { searchTitle: vi.fn(), grabForTitle: vi.fn() };

vi.mock('@kromatv/module-sdk', () => ({
  useT: () => (key: string) => key,
  moduleApiHook: () => () => acquisition,
}));

const VIEW = { releases: [], indexers: [] };

function release(): ScoredReleaseView {
  return {
    title: 'Show.S02E05.MULTi.VFF.1080p.WEB-DL-GRP',
    guid: 'g1',
    indexerId: IndexerId.parse('i1'),
    indexerName: 'T',
    sizeBytes: null,
    seeders: null,
    leechers: null,
    publishedAt: null,
    target: 'episode',
    season: 2,
    episodes: [5],
    score: 400,
    breakdown: [],
    rejected: null,
    flags: [],
    grabbable: true,
    upgrade: true,
    detailsUrl: null,
    formats: [],
  };
}

describe('useTitleSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the title route under this module tag for the scope', async () => {
    acquisition.searchTitle.mockResolvedValue(VIEW);

    const { result } = renderHook(() => useTitleSearch('show', 1399));
    act(() => result.current.run({ scope: 'episode', season: 2, episode: 5 }));

    await waitFor(() => expect(result.current.state.view).toEqual(VIEW));
    expect(acquisition.searchTitle).toHaveBeenCalledWith('show', 1399, {
      kind: 'episode',
      season: 2,
      episode: 5,
    });
  });

  it('grabs under the scope the results answer', async () => {
    acquisition.searchTitle.mockResolvedValue(VIEW);
    acquisition.grabForTitle.mockResolvedValue({ id: 'd1' });

    const { result } = renderHook(() => useTitleSearch('movie', 603));
    act(() => result.current.run({ scope: 'movie' }));
    await waitFor(() => expect(result.current.state.view).not.toBeNull());
    act(() => result.current.grab(release()));

    await waitFor(() => expect(result.current.state.grabbed).not.toBeNull());
    expect(acquisition.grabForTitle).toHaveBeenCalledWith('movie', 603, {
      scope: { kind: 'movie' },
      guid: 'g1',
      indexerId: 'i1',
    });
  });

  it('keeps the scope a failed sweep was aimed at', async () => {
    acquisition.searchTitle.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => useTitleSearch('show', 1399));
    act(() => result.current.run({ scope: 'all' }));

    await waitFor(() => expect(result.current.state.error).toBe('requests.searchFailed'));
    expect(result.current.state.scope).toEqual({ scope: 'all' });
  });
});
