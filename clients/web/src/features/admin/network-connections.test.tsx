// @vitest-environment jsdom

import { KromaApiError } from '@kromatv/client';
import { FlowsView } from '@kromatv/client/network';
import { KitProvider } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flowOf, RULES_VIEW } from '#web/features/admin/network.fixture';
import { NetworkConnections } from '#web/features/admin/network-connections';
import { FLOW_PAGE_SIZE } from '#web/features/admin/network-flows';

const api = vi.hoisted(() => ({
  flows: vi.fn(),
  rules: vi.fn(),
  modules: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      network: { flows: api.flows, rules: api.rules },
      modules: { list: api.modules },
    },
  }),
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

beforeEach(() => {
  api.rules.mockResolvedValue(structuredClone(RULES_VIEW));
  api.modules.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the connections tab', () => {
  it('lists the journal the server sends, numbered as the server numbers it', async () => {
    const body = { flows: [flowOf({ id: 4182, host: 'image.tmdb.org' })], total: 1 };
    api.flows.mockImplementation(async () => FlowsView.parse(body));

    render(<NetworkConnections />, { wrapper: Providers });

    expect(await screen.findByText('image.tmdb.org:443')).toBeTruthy();
  });

  it('asks for one page at a time and no pager when one page holds everything', async () => {
    const body = { flows: [flowOf({ id: 4182 })], total: 1 };
    api.flows.mockImplementation(async () => FlowsView.parse(body));

    render(<NetworkConnections />, { wrapper: Providers });

    await screen.findByText('api.themoviedb.org:443');
    expect(api.flows).toHaveBeenCalledWith({ limit: FLOW_PAGE_SIZE });
    expect(screen.queryByLabelText('Page 2')).toBeNull();
  });

  it('jumps to a later page from the newest connection it was showing', async () => {
    const body = { flows: [flowOf({ id: 4182 })], total: FLOW_PAGE_SIZE + 1 };
    api.flows.mockImplementation(async () => FlowsView.parse(body));
    render(<NetworkConnections />, { wrapper: Providers });

    fireEvent.click(await screen.findByLabelText('Page 2'));

    await waitFor(() =>
      expect(api.flows).toHaveBeenLastCalledWith({
        limit: FLOW_PAGE_SIZE,
        offset: FLOW_PAGE_SIZE,
        before: 4183,
      }),
    );
  });

  it('says the journal could not load instead of loading forever', async () => {
    api.flows.mockRejectedValue(new KromaApiError(403, 'GET failed (403)', { error: 'Refusé' }));

    render(<NetworkConnections />, { wrapper: Providers });

    expect(await screen.findByText('This could not be loaded')).toBeTruthy();
    expect(screen.getByText('Refusé')).toBeTruthy();
  });
});
