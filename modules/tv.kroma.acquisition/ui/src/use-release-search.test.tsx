// @vitest-environment jsdom
import type { InteractiveSearchView, ScoredReleaseView } from '@kroma/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReleaseSearch } from './use-release-search';

const client = {
  searchReleases: vi.fn(),
  grabRelease: vi.fn(),
};

vi.mock('@kroma/module-sdk', () => ({
  useT: () => (key: string) => key,
  useAdminHost: () => ({ client }),
}));

const VIEW: InteractiveSearchView = { releases: [], indexers: [] };

function release(): ScoredReleaseView {
  return {
    title: 'Show.S01E01',
    guid: 'g1',
    indexerId: 'i1' as ScoredReleaseView['indexerId'],
    indexerName: 'T',
    sizeBytes: null,
    seeders: null,
    leechers: null,
    publishedAt: null,
    target: 'episode',
    season: 1,
    episodes: [1],
    score: 10,
    breakdown: [],
    rejected: null,
    grabbable: true,
    upgrade: false,
    detailsUrl: null,
  };
}

describe('useReleaseSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with nothing asked and nothing answered', () => {
    const { result } = renderHook(() => useReleaseSearch('r1'));
    expect(result.current.state.view).toBeNull();
    expect(result.current.state.scope).toBeNull();
    expect(result.current.state.busy).toBe(false);
  });

  it('remembers the scope its answer belongs to', async () => {
    client.searchReleases.mockResolvedValue(VIEW);
    const { result } = renderHook(() => useReleaseSearch('r1'));
    act(() => result.current.run({ scope: 'season', season: 2 }));
    await waitFor(() => expect(result.current.state.view).toEqual(VIEW));
    expect(client.searchReleases).toHaveBeenCalledWith('r1', { scope: 'season', season: 2 });
    expect(result.current.state.scope).toEqual({ scope: 'season', season: 2 });
  });

  it('surfaces a failed sweep, keeping the scope it failed on', async () => {
    client.searchReleases.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useReleaseSearch('r1'));
    act(() => result.current.run({ scope: 'all' }));
    await waitFor(() => expect(result.current.state.error).toBe('requests.searchFailed'));
    expect(result.current.state.scope).toEqual({ scope: 'all' });
    expect(result.current.state.busy).toBe(false);
  });

  it('grabs under the scope the results answer, not a newer one', async () => {
    client.searchReleases.mockResolvedValue(VIEW);
    client.grabRelease.mockResolvedValue(undefined);
    const { result } = renderHook(() => useReleaseSearch('r1'));
    act(() => result.current.run({ scope: 'episode', season: 1, episode: 1 }));
    await waitFor(() => expect(result.current.state.view).not.toBeNull());

    act(() => result.current.grab(release()));
    await waitFor(() => expect(result.current.state.grabbed).not.toBeNull());
    expect(client.grabRelease).toHaveBeenCalledWith('r1', {
      guid: 'g1',
      indexerId: 'i1',
      scope: 'episode',
      season: 1,
      episode: 1,
    });
    expect(result.current.state.grabbed).toEqual({ title: 'Show.S01E01', error: false });
  });

  it('does nothing on a grab with no search behind it', () => {
    const { result } = renderHook(() => useReleaseSearch('r1'));
    act(() => result.current.grab(release()));
    expect(client.grabRelease).not.toHaveBeenCalled();
  });

  it('reports a failed grab in place, without losing the results', async () => {
    client.searchReleases.mockResolvedValue(VIEW);
    client.grabRelease.mockRejectedValue(new Error('no'));
    const { result } = renderHook(() => useReleaseSearch('r1'));
    act(() => result.current.run({ scope: 'all' }));
    await waitFor(() => expect(result.current.state.view).not.toBeNull());

    act(() => result.current.grab(release()));
    await waitFor(() => expect(result.current.state.grabbed?.error).toBe(true));
    expect(result.current.state.view).toEqual(VIEW);
    expect(result.current.state.grabbing).toBe(false);
  });

  it('reset clears the last answer', async () => {
    client.searchReleases.mockResolvedValue(VIEW);
    const { result } = renderHook(() => useReleaseSearch('r1'));
    act(() => result.current.run({ scope: 'all' }));
    await waitFor(() => expect(result.current.state.view).not.toBeNull());
    act(() => result.current.reset());
    expect(result.current.state.view).toBeNull();
    expect(result.current.state.scope).toBeNull();
  });
});
