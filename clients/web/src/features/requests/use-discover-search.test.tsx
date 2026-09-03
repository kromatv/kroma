// @vitest-environment jsdom
import type { DiscoverEntry } from '@kroma/client/discovery';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trending = vi.fn();

vi.mock('#web/shared/lib/api', () => ({ kromaClient: () => ({ discovery: { trending } }) }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: null }) }));

const { useTrending } = await import('#web/features/requests/use-discover-search');

const ENTRY = { tmdbId: 603, title: 'The Matrix' } as DiscoverEntry;

function wrapper({ children }: { children: ReactNode }) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

beforeEach(() => {
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
