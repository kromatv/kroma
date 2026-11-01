// @vitest-environment jsdom

import { InboundSummary } from '@kromatv/client/network';
import { KitProvider } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkInbound } from '#web/features/admin/network-inbound';

const api = vi.hoisted(() => ({ inbound: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { network: { inbound: api.inbound } } }),
}));

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(<>{children}</>)}
      </KitProvider>
    </QueryClientProvider>
  );
}

function answering(rows: unknown[], requests = rows.length) {
  const summary = {
    since: 1_761_782_400_000,
    totals: { requests, addresses: rows.length, bytesIn: 0, bytesOut: 1024 },
    rows,
  };
  api.inbound.mockImplementation(async () => InboundSummary.parse(summary));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the incoming tab', () => {
  it('names a client by its device, with its address and its road', async () => {
    answering([
      {
        address: '203.0.113.9',
        via: 'tunnel',
        userAgent: 'Kroma/1.0 (iPhone 17 Pro; iOS 26.0)',
        count: 12,
        bytesIn: 0,
        bytesOut: 1024,
        lastAt: 1_761_820_800_000,
      },
    ]);

    render(<NetworkInbound />, { wrapper: Providers });

    expect(await screen.findByText('iPhone 17 Pro · iOS')).toBeTruthy();
    expect(screen.getByText('203.0.113.9')).toBeTruthy();
    expect(screen.getByText('Tunnel')).toBeTruthy();
    expect(screen.getByText(/^clients$/i)).toBeTruthy();
    expect(api.inbound).toHaveBeenCalledWith(7);
  });

  it('says so when no client came over the period', async () => {
    answering([]);

    render(<NetworkInbound />, { wrapper: Providers });

    expect(await screen.findByText('No client on this period')).toBeTruthy();
  });
});
