// @vitest-environment jsdom

import type { DiscoverDetail } from '@kroma/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieView, ShowView } from '#web/shared/lib/api';

const api = vi.hoisted(() => ({
  discoverDetail: vi.fn(),
}));

vi.mock('#web/shared/lib/api', () => ({ kromaClient: () => api }));

import { useSavedTitles } from './use-saved-titles';

function detail(over: Partial<DiscoverDetail> & { tmdbId: number }): DiscoverDetail {
  return {
    kind: 'movie',
    title: `t${over.tmdbId}`,
    year: null,
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    tagline: null,
    genres: [],
    rating: null,
    runtimeMin: null,
    seasons: [],
    cast: [],
    crew: [],
    similar: [],
    inLibrary: false,
    localId: null,
    requestId: null,
    requestStatus: null,
    requestProgress: null,
    airStatus: null,
    nextAirDate: null,
    ...over,
  };
}

const MOVIE = {
  id: 'm1',
  title: 'Arrival',
  year: 2016,
  backdrop: '/b/m1',
  metadata: { rating: 7.9 },
} as unknown as MovieView;

const SHOW = {
  id: 's1',
  title: 'Severance',
  year: 2022,
  backdrop: null,
  metadata: { rating: 8.7 },
} as unknown as ShowView;

const movies = new Map([['m1', MOVIE]]);
const shows = new Map([['s1', SHOW]]);

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const render = (ids: readonly string[], ready = true) =>
  renderHook(() => useSavedTitles(ids, ready, movies, shows), { wrapper: wrapper() });

const keysOf = (result: { current: { titles: readonly { key: string }[] } }) =>
  result.current.titles.map((one) => one.key);

beforeEach(() => {
  vi.clearAllMocks();
  api.discoverDetail.mockResolvedValue(detail({ tmdbId: 42 }));
});

describe('useSavedTitles', () => {
  it('keeps the order the list gave, across all three sources', async () => {
    const { result } = render(['tmdb:42', 'm1', 's1']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(keysOf(result)).toEqual(['tmdb:42', 'm1', 's1']);
  });

  it('reads a library movie through its own fields, not the provider', async () => {
    const { result } = render(['m1']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles[0]).toMatchObject({
      kind: 'movie',
      title: 'Arrival',
      year: 2016,
      rating: 7.9,
      backdrop: '/b/m1',
      available: true,
    });
    expect(api.discoverDetail).not.toHaveBeenCalled();
  });

  it('reads a library show the same way', async () => {
    const { result } = render(['s1']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles[0]).toMatchObject({
      kind: 'show',
      title: 'Severance',
      year: 2022,
      rating: 8.7,
      backdrop: null,
      available: true,
    });
  });

  it('marks a discover title unavailable until the library holds it', async () => {
    api.discoverDetail.mockResolvedValue(
      detail({ tmdbId: 42, title: 'Dune', year: 2021, rating: 8.1, backdropUrl: '/b/42' }),
    );

    const { result } = render(['tmdb:42']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles[0]).toMatchObject({
      key: 'tmdb:42',
      title: 'Dune',
      year: 2021,
      rating: 8.1,
      backdrop: '/b/42',
      available: false,
    });
  });

  it('asks for a tv detail when the movie endpoint has no such id', async () => {
    api.discoverDetail.mockRejectedValueOnce(new Error('404'));
    api.discoverDetail.mockResolvedValueOnce(detail({ tmdbId: 7, kind: 'show', title: 'Fringe' }));

    const { result } = render(['tmdb:7']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles[0]).toMatchObject({ kind: 'show', title: 'Fringe' });
    expect(api.discoverDetail).toHaveBeenNthCalledWith(1, 'movie', 7);
    expect(api.discoverDetail).toHaveBeenNthCalledWith(2, 'tv', 7);
  });

  it('drops a tmdb id neither endpoint answers for', async () => {
    api.discoverDetail.mockRejectedValue(new Error('gone'));

    const { result } = render(['tmdb:9', 'm1']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(keysOf(result)).toEqual(['m1']);
  });

  it('drops an id nothing in the library knows', async () => {
    const { result } = render(['m404', 's404']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles).toEqual([]);
  });

  it('never asks the provider about a tmdb id that is not a number', async () => {
    const { result } = render(['tmdb:abc']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles).toEqual([]);
    expect(api.discoverDetail).not.toHaveBeenCalled();
  });

  it('stays unsettled while a discover entry is in flight', () => {
    api.discoverDetail.mockReturnValue(new Promise(() => {}));

    const { result } = render(['tmdb:42']);

    expect(result.current.settled).toBe(false);
    expect(result.current.titles).toEqual([]);
  });

  it('stays unsettled while the caller says it is not ready', async () => {
    const { result } = render(['m1'], false);

    await waitFor(() => expect(keysOf(result)).toEqual(['m1']));

    expect(result.current.settled).toBe(false);
  });

  it('falls back to null for a library title with no year and no metadata', async () => {
    const bare = new Map([
      ['m2', { id: 'm2', title: 'Untitled', backdrop: null } as unknown as MovieView],
    ]);
    const bareShow = new Map([
      ['s2', { id: 's2', title: 'Unnamed', backdrop: null } as unknown as ShowView],
    ]);

    const { result } = renderHook(() => useSavedTitles(['m2', 's2'], true, bare, bareShow), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(result.current.titles).toMatchObject([
      { key: 'm2', kind: 'movie', year: null, rating: null },
      { key: 's2', kind: 'show', year: null, rating: null },
    ]);
  });

  it('asks for each tmdb id once, however many library ids sit beside them', async () => {
    api.discoverDetail.mockImplementation(async (_kind: string, tmdbId: number) =>
      detail({ tmdbId }),
    );

    const { result } = render(['tmdb:1', 'm1', 'tmdb:2', 's1']);

    await waitFor(() => expect(result.current.settled).toBe(true));

    expect(keysOf(result)).toEqual(['tmdb:1', 'm1', 'tmdb:2', 's1']);
    expect(api.discoverDetail).toHaveBeenCalledTimes(2);
  });
});
