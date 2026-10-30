// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ServerUpdateIndicator, ServerUpdateNotice } from './server-update-notice';

const mocks = vi.hoisted(() => ({ permissions: ['settings.manage'], updates: vi.fn() }));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'viewer', permissions: mocks.permissions },
    client: { admin: { updates: mocks.updates } },
  }),
}));
const { render, clearPressGuard } = createInputTestHost();
const status = (available = true) => ({
  version: '0.1.41',
  build: 3599999,
  channel: 'Stable',
  auto: true,
  autoInstall: false,
  available,
  latest: {
    version: '0.1.42',
    build: 3600000,
    url: 'https://github.com/kromatv/kroma/releases/tag/v0.1.42',
  },
});
let queryClient: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  clearPressGuard();
  mocks.permissions = ['settings.manage'];
  mocks.updates.mockResolvedValue(status());
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

function show() {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <nav aria-label="Library navigation">
        <ServerUpdateNotice />
        <ServerUpdateIndicator />
      </nav>
    ),
  });
  const updates = createRoute({
    getParentRoute: () => root,
    path: '/admin/updates',
    component: () => <div>Updates page</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, updates]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <I18nProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

it('shows the release outside Admin and both controls link to its update page', async () => {
  show();
  const links = await screen.findAllByRole('link', { name: 'KROMA 0.1.42 is available' });
  expect(links).toHaveLength(2);
  for (const link of links) expect(link.getAttribute('href')).toBe('/admin/updates');
  expect(screen.getByText('Update available')).toBeTruthy();
  expect(screen.getAllByTitle('KROMA 0.1.42 is available')).toHaveLength(2);
  expect(mocks.updates).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Review'));
  await screen.findByText('Updates page');
});

it.each([{ permissions: [] }, { permissions: ['users.manage'] }])(
  'does not request or display update status without settings permission (%s)',
  async ({ permissions }) => {
    mocks.permissions = permissions;
    // A prior admin's cache must never create a notice for a different viewer.
    queryClient.setQueryData(['admin', 'updates'], status());
    show();
    await screen.findByRole('navigation', { name: 'Library navigation' });
    expect(screen.queryByText('Update available')).toBeNull();
    expect(mocks.updates).not.toHaveBeenCalled();
  },
);

it('stays quiet when the server is already up to date', async () => {
  mocks.updates.mockResolvedValue(status(false));
  show();
  await waitFor(() =>
    expect(queryClient.getQueryState(['admin', 'updates'])?.status).toBe('success'),
  );
  expect(screen.queryByRole('link')).toBeNull();
});

it('keeps the library usable when the status request fails', async () => {
  mocks.updates.mockRejectedValue(new TypeError('offline'));
  show();
  await waitFor(() =>
    expect(queryClient.getQueryState(['admin', 'updates'])?.status).toBe('error'),
  );
  expect(screen.queryByRole('link')).toBeNull();
});

it('shows an update already in progress instead of offering a new update', async () => {
  mocks.updates.mockResolvedValue({
    ...status(),
    operation: {
      id: 'in-flight',
      target: { channel: 'Stable', version: '0.1.42', build: 3600000 },
      phase: 'installing',
      requestedAt: '2026-10-29T22:00:00Z',
    },
  });
  show();
  expect(await screen.findAllByRole('link', { name: 'Updating server' })).toHaveLength(2);
  expect(screen.getByText('View')).toBeTruthy();
  expect(screen.queryByText('Update available')).toBeNull();
});
