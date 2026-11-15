// @vitest-environment jsdom

import { MiddlewareView } from '@kromatv/client/network';
import { KitProvider } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moved, NetworkMiddleware } from '#web/features/admin/network-middleware';

const api = vi.hoisted(() => ({ middleware: vi.fn(), saveMiddleware: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { network: api } }),
}));
vi.mock('#web/features/admin/network-callers', () => ({
  useCallerName: () => (caller: string) => caller,
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

const one = (module: string, over: object = {}) => ({
  module,
  required: false,
  answering: true,
  skipped: 0,
  lastSkip: null,
  ...over,
});

function answering(middleware: unknown[]) {
  api.middleware.mockImplementation(async () => MiddlewareView.parse({ middleware }));
  api.saveMiddleware.mockResolvedValue(undefined);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('moved', () => {
  const list = [one('a'), one('b'), one('c')];

  it('moves one middleware a place up or down', () => {
    expect(moved(list, 1, -1)?.map((m) => m.module)).toEqual(['b', 'a', 'c']);
    expect(moved(list, 1, 1)?.map((m) => m.module)).toEqual(['a', 'c', 'b']);
  });

  it('moves nothing off either end', () => {
    expect(moved(list, 0, -1)).toBeNull();
    expect(moved(list, 2, 1)).toBeNull();
  });
});

describe('the middleware tab', () => {
  it('says so when no module sees a decision', async () => {
    answering([]);

    render(<NetworkMiddleware />, { wrapper: Providers });

    expect(await screen.findByText('No module sees a decision yet')).toBeTruthy();
  });

  it('lists each middleware in order, with the ones not answering and the skips', async () => {
    answering([
      one('tv.example.blocklist', { required: true, skipped: 3 }),
      one('tv.example.router', { answering: false }),
    ]);

    render(<NetworkMiddleware />, { wrapper: Providers });

    expect(await screen.findByText('tv.example.blocklist')).toBeTruthy();
    expect(screen.getByText('Skipped 3 times since the server started')).toBeTruthy();
    expect(screen.getAllByText('Not answering')).toHaveLength(1);
  });

  it('saves the whole order when a middleware is moved', async () => {
    answering([one('tv.example.blocklist', { required: true }), one('tv.example.router')]);
    render(<NetworkMiddleware />, { wrapper: Providers });

    fireEvent.click(await screen.findByLabelText('Ask tv.example.router earlier'));

    await waitFor(() =>
      expect(api.saveMiddleware).toHaveBeenCalledWith({
        middleware: [
          { module: 'tv.example.router', required: false },
          { module: 'tv.example.blocklist', required: true },
        ],
      }),
    );
  });

  it('saves a middleware as required when its switch is turned on', async () => {
    answering([one('tv.example.blocklist')]);
    render(<NetworkMiddleware />, { wrapper: Providers });

    fireEvent.click(
      await screen.findByLabelText(
        'Block the connection when tv.example.blocklist does not answer in time',
      ),
    );

    await waitFor(() =>
      expect(api.saveMiddleware).toHaveBeenCalledWith({
        middleware: [{ module: 'tv.example.blocklist', required: true }],
      }),
    );
  });
});
