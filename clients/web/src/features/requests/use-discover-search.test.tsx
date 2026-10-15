// @vitest-environment jsdom
import { type User, UserId } from '@kromatv/client/accounts';
import type { DiscoverEntry } from '@kromatv/client/discovery';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  user: null as User | null,
  trending: vi.fn(),
  discover: vi.fn(),
  library: vi.fn(),
}));

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => ({
    discovery: { trending: H.trending, search: H.discover },
    media: { search: H.library },
  }),
}));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: H.user }) }));

const { useDiscoverSearch, useTrending } = await import(
  '#web/features/requests/use-discover-search'
);

const MEMBER: User = {
  id: UserId.parse('u1'),
  email: 'ada@kroma.test',
  username: 'ada',
  permissions: [],
  createdAt: '2026-01-01',
  hasPin: false,
};

const ENTRY = { tmdbId: 603, title: 'The Matrix' } as DiscoverEntry;

function wrapper({ children }: { children: ReactNode }) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  H.user = null;
  H.trending.mockReset().mockResolvedValue({ results: [ENTRY] });
  H.discover.mockReset().mockResolvedValue({ results: [ENTRY] });
  H.library.mockReset().mockResolvedValue({ results: [] });
});

describe('the trending rail', () => {
  it("hands back this week's titles when it is on", async () => {
    const { result } = renderHook(() => useTrending(true), { wrapper });

    await waitFor(() => expect(result.current.entries).toEqual([ENTRY]));

    expect(result.current.loading).toBe(false);
  });

  it('fetches nothing, and reports neither loading nor entries, when it is off', () => {
    const { result } = renderHook(() => useTrending(false), { wrapper });

    expect(H.trending).not.toHaveBeenCalled();
    expect(result.current).toEqual({ loading: false, entries: [] });
  });
});

describe('the search', () => {
  it('asks TMDB for a signed-in member who holds no permission', async () => {
    H.user = MEMBER;

    const { result } = renderHook(() => useDiscoverSearch('matrix', 'all'), { wrapper });

    await waitFor(() => expect(result.current.discover).toEqual([ENTRY]));
    expect(H.discover).toHaveBeenCalledWith('matrix', { type: 'all' });
  });

  it('asks TMDB nothing before anyone is signed in', async () => {
    const { result } = renderHook(() => useDiscoverSearch('matrix', 'all'), { wrapper });

    await waitFor(() => expect(H.library).toHaveBeenCalled());
    expect(H.discover).not.toHaveBeenCalled();
    expect(result.current.canDiscover).toBe(false);
  });
});
