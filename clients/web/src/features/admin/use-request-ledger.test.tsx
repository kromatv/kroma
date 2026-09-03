// @vitest-environment jsdom
import { RequestId } from '@kroma/client/requests';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRequestLedger } from './use-request-ledger';

const client = { requests: { ledger: vi.fn() } };

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ client }) }));

const REQUEST = RequestId.parse('r1');

function wrapper({ children }: { children: ReactNode }) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client.requests.ledger.mockReset().mockResolvedValue({ seasons: [] });
});

describe('the admin console’s request ledger', () => {
  it('reads the core endpoint under the key the module shares', async () => {
    const { result } = renderHook(() => useRequestLedger(REQUEST, true), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ seasons: [] }));

    expect(client.requests.ledger).toHaveBeenCalledWith(REQUEST);
  });

  it('asks for nothing while the header card is not showing', () => {
    renderHook(() => useRequestLedger(REQUEST, false), { wrapper });

    expect(client.requests.ledger).not.toHaveBeenCalled();
  });
});
