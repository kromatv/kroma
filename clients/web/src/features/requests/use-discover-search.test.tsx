// @vitest-environment jsdom
import type { DiscoverEntry } from '@kromatv/client/discovery';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trending = vi.fn();
const trendingQuery = (page: unknown) => ({
  queryKey: ['discover', 'trending', page],
  queryFn: () => trending(page),
});

vi.mock('#web/shared/lib/api', () => ({ kromaClient: () => ({ discovery: { trending } }) }));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const { QueryClient: ActualQueryClient } =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const queryCache = new ActualQueryClient();
  const stubs = { discovery: { trending }, query: { discovery: { trending: trendingQuery } } };
  const runtime = createWebTestRuntime(stubs, () => queryCache);
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: null }) }));

const { useTrending, useTrendingPage } =
  await import('#web/features/requests/use-discover-search.hook');

const ENTRY = { tmdbId: 603, title: 'The Matrix' } as DiscoverEntry;

let queries: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  trending.mockReset().mockResolvedValue({ results: [ENTRY] });
});

describe('the trending rail', () => {
  it('hands back this week’s titles for a user who can request', async () => {
    const { result } = renderHook(() => useTrending(true), { wrapper });

    await waitFor(() => expect(result.current.entries).toEqual([ENTRY]));

    expect(result.current.loading).toBe(false);
  });

  it('fetches nothing, and reports neither loading nor entries, when it is off', () => {
    const { result } = renderHook(() => useTrending(false), { wrapper });

    expect(trending).not.toHaveBeenCalled();
    expect(result.current).toEqual({ loading: false, entries: [] });
  });
});

describe('a page of trending titles', () => {
  it('is loading until its page arrives', async () => {
    trending.mockResolvedValue({ results: [ENTRY], page: 1, totalPages: 8 });

    const { result } = renderHook(() => useTrendingPage('movie', 1), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, entries: [ENTRY], totalPages: 8 });
  });

  it('keeps the page count of the page it leaves while the next one loads', async () => {
    trending.mockResolvedValueOnce({ results: [ENTRY], page: 1, totalPages: 8 });
    trending.mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ page }) => useTrendingPage('movie', page), {
      wrapper,
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ page: 2 });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.totalPages).toBe(8);
  });

  it('is not loading while the page it shows is fetched again', async () => {
    trending.mockResolvedValueOnce({ results: [ENTRY], page: 1, totalPages: 8 });
    trending.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useTrendingPage('movie', 1), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    void queries.refetchQueries();

    await waitFor(() => expect(trending).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({ loading: false, entries: [ENTRY], totalPages: 8 });
  });

  it('stops loading when the page cannot be read', async () => {
    trending.mockRejectedValue(new Error('the provider is down'));

    const { result } = renderHook(() => useTrendingPage('tv', 3), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('asks for the kind and the page it shows', async () => {
    trending.mockResolvedValue({ results: [ENTRY], page: 2, totalPages: 8 });

    const { result } = renderHook(() => useTrendingPage('tv', 2), { wrapper });

    await waitFor(() => expect(result.current.entries).toEqual([ENTRY]));
    expect(trending).toHaveBeenCalledWith({ type: 'tv', page: 2 });
  });
});
