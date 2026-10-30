// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
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
import { useMarkReleaseSeen } from '#web/features/releases/use-mark-release-seen';
import { WhatsNewLink } from './whats-new-link';

const api = vi.hoisted(() => ({ list: vi.fn(), markSeen: vi.fn() }));
vi.mock('#web/shared/lib/web-runtime', () => {
  const runtime = {
    client: { releases: { markSeen: api.markSeen } },
    queries: {
      userQueries: { releases: () => ({ queryKey: ['sidebar-releases'], queryFn: api.list }) },
    },
  };
  return { useWebRuntime: () => runtime };
});
const { render, clearPressGuard } = createInputTestHost();
let queryClient: QueryClient;
const view = (unseen: string | null) => ({ current: '0.1.42', unseen, releases: [] });
beforeEach(() => {
  vi.clearAllMocks();
  clearPressGuard();
  api.list.mockResolvedValue(view('0.1.42'));
  api.markSeen.mockImplementation(async () => {
    api.list.mockResolvedValue(view(null));
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

function ReadReleases() {
  const { data } = useQuery({ queryKey: ['sidebar-releases'], queryFn: api.list });
  useMarkReleaseSeen(data?.unseen ?? null);
  return <div>Release notes</div>;
}
function show() {
  const root = createRootRoute({
    component: () => (
      <>
        <WhatsNewLink />
        <Outlet />
      </>
    ),
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Library</div>,
  });
  const notes = createRoute({
    getParentRoute: () => root,
    path: '/whats-new',
    component: ReadReleases,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, notes]),
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

it('hides the sidebar entry after the release notes have been opened and marked seen', async () => {
  show();
  fireEvent.click(await screen.findByRole('link', { name: /what.s new/i }));
  await screen.findByText('Release notes');
  await waitFor(() => expect(api.markSeen).toHaveBeenCalledWith('0.1.42'));
  await waitFor(() => expect(screen.queryByRole('link', { name: /what.s new/i })).toBeNull());
});

it('stays hidden when there are no unread notes and reappears for a new release', async () => {
  api.list.mockResolvedValue(view(null));
  show();
  await screen.findByText('Library');
  await waitFor(() =>
    expect(queryClient.getQueryState(['sidebar-releases'])?.status).toBe('success'),
  );
  expect(screen.queryByRole('link')).toBeNull();
  queryClient.setQueryData(['sidebar-releases'], { ...view('0.1.43'), current: '0.1.43' });
  expect(await screen.findByRole('link', { name: /what.s new/i })).toBeTruthy();
  expect(screen.getByText('0.1.43')).toBeTruthy();
});
