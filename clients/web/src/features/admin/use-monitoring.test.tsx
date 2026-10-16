// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useMonitoredTitles,
  useMonitoringRefresh,
  useSeasonLedger,
  useTitleLedger,
} from './use-monitoring';

const client = {
  monitoring: { list: vi.fn(), ledger: vi.fn(), seasonLedger: vi.fn() },
};

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ client }) }));

let queries: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.monitoring.list.mockReset().mockResolvedValue([]);
  client.monitoring.ledger.mockReset().mockResolvedValue({ seasons: [] });
  client.monitoring.seasonLedger.mockReset().mockResolvedValue({ season: 2, episodes: [] });
});

describe('the monitored titles', () => {
  it('reads the list under an admin key, so a console event refreshes it', async () => {
    const { result } = renderHook(() => useMonitoredTitles(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([]));

    expect(queries.getQueryData(['admin', 'monitoring', 'all'])).toEqual([]);
  });
});

describe("a title's ledger", () => {
  it('asks for the title by kind and tmdb id', async () => {
    const { result } = renderHook(() => useTitleLedger('show', 95396), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ seasons: [] }));

    expect(client.monitoring.ledger).toHaveBeenCalledWith('show', 95396);
  });
});

describe('a season of a monitored show', () => {
  it('fetches the season once it is open', async () => {
    const { result } = renderHook(() => useSeasonLedger(95396, 2, true), { wrapper });

    await waitFor(() => expect(result.current.data?.season).toBe(2));

    expect(client.monitoring.seasonLedger).toHaveBeenCalledWith(95396, 2);
  });

  it('asks for nothing while the season is closed', () => {
    renderHook(() => useSeasonLedger(95396, 2, false), { wrapper });

    expect(client.monitoring.seasonLedger).not.toHaveBeenCalled();
  });
});

describe('a write to one monitored title', () => {
  it('drops every monitoring entry, counts and seasons together', async () => {
    queries.setQueryData(['admin', 'monitoring', 'all'], ['stale']);
    queries.setQueryData(['admin', 'monitoring', 'show', 95396, 'season', 2], ['stale']);
    queries.setQueryData(['admin', 'requests', 'all'], ['kept']);

    const { result } = renderHook(() => useMonitoringRefresh(), { wrapper });
    await result.current();

    expect(queries.getQueryState(['admin', 'monitoring', 'all'])?.isInvalidated).toBe(true);
    expect(
      queries.getQueryState(['admin', 'monitoring', 'show', 95396, 'season', 2])?.isInvalidated,
    ).toBe(true);
    expect(queries.getQueryState(['admin', 'requests', 'all'])?.isInvalidated).toBe(false);
  });
});
