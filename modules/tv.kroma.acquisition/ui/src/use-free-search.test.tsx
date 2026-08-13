// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManualSearchView } from './schemas';
import { useFreeSearch } from './use-free-search';

vi.mock('@kroma/module-sdk', () => ({ useT: () => (key: string) => key }));

const EMPTY: ManualSearchView = { releases: [], indexers: [] };

function stubApi(impl?: () => Promise<ManualSearchView>) {
  const search = vi.fn(impl ?? (() => Promise.resolve(EMPTY)));
  return { api: { search }, search };
}

describe('useFreeSearch', () => {
  it('opens on the request it was given', () => {
    const { api } = stubApi();
    const { result } = renderHook(() => useFreeSearch(api, 'Alien: Earth', 'season', 3));
    expect(result.current.query).toBe('Alien: Earth');
    expect(result.current.target).toBe('season');
    expect(result.current.season).toBe('3');
    expect(result.current.episode).toBe('');
  });

  it('is not ready until the target has the numbers it needs', () => {
    const { api } = stubApi();
    const { result } = renderHook(() => useFreeSearch(api, 'Alien', 'episode', null));
    expect(result.current.ready).toBe(false);
    act(() => result.current.setSeason('1'));
    // An episode search still wants an episode.
    expect(result.current.ready).toBe(false);
    act(() => result.current.setEpisode('6'));
    expect(result.current.ready).toBe(true);
  });

  it('sends only the numbers the target asks for', async () => {
    const { api, search } = stubApi();
    const { result } = renderHook(() => useFreeSearch(api, 'Heat', 'movie', 2));
    act(() => result.current.run());
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search).toHaveBeenCalledWith({
      query: 'Heat',
      kind: 'movie',
      season: null,
      episode: null,
    });
  });

  it('refuses to run when the target is incomplete', () => {
    const { api, search } = stubApi();
    const { result } = renderHook(() => useFreeSearch(api, 'Alien', 'season', null));
    act(() => result.current.run());
    expect(search).not.toHaveBeenCalled();
  });

  it('keeps what the sweep answered', async () => {
    const view: ManualSearchView = {
      releases: [],
      indexers: [{ id: 'i1', name: 'T', found: 3, error: null, elapsedMs: 12 }],
    };
    const { api } = stubApi(() => Promise.resolve(view));
    const { result } = renderHook(() => useFreeSearch(api, 'Heat', 'movie', null));
    act(() => result.current.run());
    await waitFor(() => expect(result.current.view).toEqual(view));
    expect(result.current.busy).toBe(false);
  });

  it('surfaces a failure instead of an empty result', async () => {
    const { api } = stubApi(() => Promise.reject(new Error('nope')));
    const { result } = renderHook(() => useFreeSearch(api, 'Heat', 'movie', null));
    act(() => result.current.run());
    await waitFor(() => expect(result.current.error).toBe('requests.searchFailed'));
    expect(result.current.view).toBeNull();
  });

  it('retires the answer to the old question when the target changes', async () => {
    const { api } = stubApi();
    const { result } = renderHook(() => useFreeSearch(api, 'Heat', 'movie', null));
    act(() => result.current.run());
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.pickTarget('season'));
    expect(result.current.view).toBeNull();
    expect(result.current.target).toBe('season');
  });

  it('ignores an answer to a question that has been superseded', async () => {
    const second: ManualSearchView = {
      releases: [],
      indexers: [{ id: 'second', name: 'S', found: 1, error: null, elapsedMs: 1 }],
    };
    let resolveFirst: ((v: ManualSearchView) => void) | undefined;
    let call = 0;
    const { api } = stubApi(() => {
      call += 1;
      if (call === 1) {
        return new Promise<ManualSearchView>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(second);
    });
    const { result } = renderHook(() => useFreeSearch(api, 'Heat', 'movie', null));
    act(() => result.current.run());
    act(() => result.current.run());
    await waitFor(() => expect(result.current.view).toEqual(second));
    // The slow first sweep lands last, and must not overwrite the newer answer.
    act(() => resolveFirst?.(EMPTY));
    await waitFor(() => expect(result.current.view).toEqual(second));
  });
});
