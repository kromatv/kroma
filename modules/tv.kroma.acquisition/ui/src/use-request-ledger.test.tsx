// @vitest-environment jsdom
import { RequestId } from '@kroma/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRequestLedger, useSeasonLedger } from './use-request-ledger';

const client = {
  requests: { ledger: vi.fn(), seasonLedger: vi.fn() },
};

vi.mock('@kroma/module-sdk', () => ({ useAdminHost: () => ({ client }) }));

const REQUEST = RequestId.parse('r1');

function wrapper({ children }: { children: ReactNode }) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client.requests.ledger.mockReset().mockResolvedValue({ seasons: [] });
  client.requests.seasonLedger.mockReset().mockResolvedValue({ episodes: [] });
});

describe('the request ledger', () => {
  it('reads the whole ledger once the page wants it', async () => {
    const { result } = renderHook(() => useRequestLedger(REQUEST, true), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ seasons: [] }));

    expect(client.requests.ledger).toHaveBeenCalledWith(REQUEST);
  });

  it('asks for nothing while the page has not opened it', () => {
    renderHook(() => useRequestLedger(REQUEST, false), { wrapper });

    expect(client.requests.ledger).not.toHaveBeenCalled();
  });
});

describe('one season of the ledger', () => {
  it('costs one call for the season the admin opened', async () => {
    const { result } = renderHook(() => useSeasonLedger(REQUEST, 3), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ episodes: [] }));

    expect(client.requests.seasonLedger).toHaveBeenCalledWith(REQUEST, 3);
  });

  it('stays off until a season is open, so a long show costs nothing up front', () => {
    renderHook(() => useSeasonLedger(REQUEST, null), { wrapper });

    expect(client.requests.seasonLedger).not.toHaveBeenCalled();
  });
});
