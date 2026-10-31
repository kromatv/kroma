// @vitest-environment jsdom

import type { Flow } from '@kromatv/client/network';
import { I18nProvider } from '@kromatv/ui';
import { createStyleTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flowOf, RULES_VIEW } from '#web/features/admin/network.fixture';
import { FlowTable } from '#web/features/admin/network-flow-table';

const modules = vi.hoisted(() => vi.fn());

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { modules: { list: modules } } }),
}));

const { pinDesignWidth, render } = createStyleTestHost();

afterEach(() => {
  cleanup();
  pinDesignWidth();
});

function mount(flows: readonly Flow[]) {
  pinDesignWidth(1600);
  modules.mockResolvedValue([{ id: 'tv.kroma.torrents', name: 'Torrent downloads' }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale="en">
        <FlowTable flows={flows} rules={RULES_VIEW.rules} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const cells = (row: number) =>
  within(screen.getAllByRole('row')[row] as HTMLElement)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('the connection journal', () => {
  it('names a module by the name its manifest gives and the server as KROMA', async () => {
    mount([flowOf({ id: 1, caller: 'tv.kroma.torrents' }), flowOf({ id: 2 })]);

    expect(await screen.findByText('Torrent downloads')).toBeTruthy();
    expect(screen.getByText('KROMA')).toBeTruthy();
  });

  it('reads a connection the VPN carried from end to end', () => {
    mount([
      flowOf({
        caller: 'tv.kroma.torrents',
        purpose: 'trackers',
        host: 'tracker.example',
        port: 1337,
        route: 'vpn',
        status: 200,
        bytesIn: 2048,
        bytesOut: 512,
        durationMs: 1450,
        rule: 'r-1',
      }),
    ]);

    expect(cells(1).slice(2)).toEqual([
      'trackers',
      'tracker.example:1337GET',
      'VPN',
      '200',
      '2 KB / 512 B',
      '1.5 s',
      'Rule 1',
    ]);
  });

  it('reads why a refused connection failed and the rule that refused it', () => {
    mount([flowOf({ route: 'blocked', status: null, error: 'refused', rule: 'r-2' })]);

    expect(cells(1).slice(3, 6)).toEqual(['api.themoviedb.org:443refused', 'Blocked', '-']);
    expect(cells(1).at(-1)).toBe('Rule 2Publicité');
  });

  it('says the default action decided when no rule matched', () => {
    mount([flowOf({ rule: null })]);

    expect(cells(1).at(-1)).toBe('Default');
  });
});
