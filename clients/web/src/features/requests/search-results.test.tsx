// @vitest-environment jsdom
import { type User, UserId } from '@kromatv/client/accounts';
import type { DiscoverEntry } from '@kromatv/client/discovery';
import { I18nProvider } from '@kromatv/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverSearchState } from './use-discover-search';

const H = vi.hoisted(() => ({ user: null as User | null, offered: false }));

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ client: {}, user: H.user }) }));
vi.mock('#web/shared/lib/watched', () => ({
  useWatched: () => ({ isWatched: () => false, toggleWatched: () => {} }),
}));
vi.mock('#web/shared/lib/mylist', () => ({
  useMyList: () => ({ inList: () => false, toggle: () => {} }),
}));
vi.mock('#web/shared/lib/watchable', () => ({
  useWatchable: () => ({
    offered: H.offered,
    sources: [],
    source: null,
    choose: () => {},
    api: null,
  }),
}));
vi.mock('#web/shared/ui/tile-grid', () => ({
  TileGrid: ({ children }: { children: (width: number) => ReactNode }) => children(180),
}));

const { SearchResults } = await import('./search-results');

function account(permissions: string[]): User {
  return {
    id: UserId.parse('u1'),
    email: 'ada@kroma.test',
    username: 'ada',
    permissions,
    createdAt: '2026-01-01',
    hasPin: false,
  };
}

function discovered(over: Partial<DiscoverEntry>): DiscoverEntry {
  return {
    kind: 'movie',
    tmdbId: 45745,
    title: 'Sintel',
    year: 2010,
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    rating: null,
    inLibrary: false,
    localId: null,
    requestId: null,
    requestStatus: null,
    requestProgress: null,
    ...over,
  };
}

const STATE: DiscoverSearchState = {
  loading: false,
  local: [],
  discover: [
    discovered({}),
    discovered({ kind: 'show', tmdbId: 1399, title: 'Game of Thrones', year: 2011 }),
  ],
  canDiscover: true,
};

async function results() {
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider locale="en">
          <SearchResults state={STATE} />
        </I18nProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(cleanup);

beforeEach(() => {
  H.offered = true;
});

describe('the search results, for a member who may not request', () => {
  beforeEach(() => {
    H.user = account([]);
  });

  it('shows what TMDB found', async () => {
    await results();

    expect(screen.getByText('Discover')).toBeTruthy();
    expect(screen.getByLabelText('Sintel')).toBeTruthy();
    expect(screen.getByLabelText('Game of Thrones')).toBeTruthy();
  });

  it('offers to play the film and nothing for the series', async () => {
    await results();

    expect(screen.getAllByLabelText('Play')).toHaveLength(1);
  });

  it('offers no play on a server that cannot watch a download in flight', async () => {
    H.offered = false;

    await results();

    expect(screen.queryByLabelText('Play')).toBeNull();
  });

  it('offers no request', async () => {
    await results();

    expect(screen.queryByLabelText('Request')).toBeNull();
  });

  it('opens the watch page of the film when Play is pressed', async () => {
    const router = await results();

    fireEvent.click(screen.getByLabelText('Play'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/watch/movie/45745'));
  });
});

describe('the search results, for a member who may request', () => {
  it('offers the request beside Play', async () => {
    H.user = account(['requests.create']);

    await results();

    expect(screen.getAllByLabelText('Request')).toHaveLength(2);
    expect(screen.getAllByLabelText('Play')).toHaveLength(1);
  });
});
