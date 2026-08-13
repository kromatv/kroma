// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AdminHostProvider } from './admin/context';
import { defineModule } from './define';
import { ModuleRegistry } from './registry';
import { ModuleSlot, ModuleSlotProvider } from './slot';

const MANIFEST = { id: 'tv.kroma.acq', version: '1.0.0' };

function mod(id: string, label: string, order?: number) {
  return defineModule(
    { ...MANIFEST, id },
    {
      slots: [
        {
          slot: 'requests.detail' as const,
          order,
          component: ({ title }: { title: string }) => <span>{`${label}:${title}`}</span>,
        },
      ],
    },
  );
}

function mount(registry: ModuleRegistry, enabled: { id: string; enabled?: boolean }[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The enabled flags come from `GET /api/modules`, which the slot reads through
  // the shared ['modules'] query; seeding it keeps the test off the network.
  queryClient.setQueryData(['modules'], enabled);
  const client = { modules: () => Promise.resolve(enabled) } as never;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminHostProvider value={{ client, user: null, apiBase: '' }}>
        <ModuleSlotProvider registry={registry}>{children}</ModuleSlotProvider>
      </AdminHostProvider>
    </QueryClientProvider>
  );
  return render(
    <ModuleSlot
      name="requests.detail"
      requestId="r1"
      kind="show"
      title="Alien"
      canGrab
      fallback={<span>nothing</span>}
    />,
    { wrapper },
  );
}

describe('ModuleSlot', () => {
  it('renders what an enabled module contributes, with the page-supplied props', () => {
    const registry = new ModuleRegistry().register(mod('tv.kroma.acq', 'acq'));
    mount(registry, [{ id: 'tv.kroma.acq', enabled: true }]);
    expect(screen.getByText('acq:Alien')).toBeTruthy();
  });

  it('falls back when nothing is registered for the slot', () => {
    mount(new ModuleRegistry(), []);
    expect(screen.getByText('nothing')).toBeTruthy();
  });

  it('falls back when the only contributor is disabled', () => {
    const registry = new ModuleRegistry().register(mod('tv.kroma.acq', 'acq'));
    mount(registry, [{ id: 'tv.kroma.acq', enabled: false }]);
    expect(screen.getByText('nothing')).toBeTruthy();
    expect(screen.queryByText('acq:Alien')).toBeNull();
  });

  it('renders several contributors in their declared order', () => {
    const registry = new ModuleRegistry()
      .register(mod('tv.kroma.b', 'b', 2))
      .register(mod('tv.kroma.a', 'a', 1));
    const { container } = mount(registry, [
      { id: 'tv.kroma.a', enabled: true },
      { id: 'tv.kroma.b', enabled: true },
    ]);
    expect(container.textContent).toBe('a:Alienb:Alien');
  });

  it('renders the fallback with no provider at all, rather than throwing', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['modules'], []);
    const client = { modules: () => Promise.resolve([]) } as never;
    render(
      <QueryClientProvider client={queryClient}>
        <AdminHostProvider value={{ client, user: null, apiBase: '' }}>
          <ModuleSlot
            name="requests.detail"
            requestId="r1"
            kind="movie"
            title="Heat"
            canGrab={false}
            fallback={<span>nothing</span>}
          />
        </AdminHostProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText('nothing')).toBeTruthy();
  });
});
