// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  home: vi.fn(),
  saved: vi.fn(),
}));

const SAVED_KEY = ['playback', 'myList'];

vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({
    query: {
      media: {
        homeCards: (opts: { layouts: readonly string[] }) => ({
          queryKey: ['media', 'homeCards', opts],
          queryFn: () => server.home(opts),
        }),
      },
      playback: {
        myList: () => ({ queryKey: SAVED_KEY, queryFn: () => server.saved() }),
      },
    },
  }),
}));

const { useHomeFeed } = await import('./home-feed.hook');

function renderFeed() {
  const queries = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queries}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useHomeFeed(), { wrapper });
  const settled = () => waitFor(() => expect(queries.isFetching()).toBe(0));
  return { ...view, queries, settled };
}

beforeEach(() => {
  vi.clearAllMocks();
  server.home.mockResolvedValue([]);
  server.saved.mockResolvedValue(['itm_1']);
});

describe('the home feed', () => {
  it('names every layout the app draws', async () => {
    const { settled } = renderFeed();

    await settled();

    expect(server.home).toHaveBeenCalledWith({ layouts: ['hero', 'spotlight', 'ranked', 'wide'] });
  });

  it('is asked for once while the saved titles stay as they were', async () => {
    const { queries, settled } = renderFeed();
    await settled();

    await act(() => queries.invalidateQueries({ queryKey: SAVED_KEY }));
    await settled();

    expect(server.saved).toHaveBeenCalledTimes(2);
    expect(server.home).toHaveBeenCalledTimes(1);
  });

  it('is asked for again once a title is saved', async () => {
    const { queries, settled } = renderFeed();
    await settled();
    server.saved.mockResolvedValue(['itm_1', 'shw_2']);

    await act(() => queries.invalidateQueries({ queryKey: SAVED_KEY }));
    await settled();

    await waitFor(() => expect(server.home).toHaveBeenCalledTimes(2));
  });
});
