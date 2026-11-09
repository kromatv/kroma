import { expect, it, vi } from 'vitest';
import { getRouter } from './router';

const H = vi.hoisted(() => ({
  ensureSession: vi.fn(async () => {}),
  prefetchModules: vi.fn(async () => {}),
  runtime: { client: { hasAuth: true }, queryClient: {} },
}));

vi.mock('#web/shared/lib/api', () => ({
  createWebRuntime: () => ({ ...H.runtime, ensureSession: H.ensureSession }),
}));
vi.mock('#web/modules/remotes', () => ({ prefetchModules: H.prefetchModules }));
vi.mock('#web/routeTree.gen', async () => {
  const { createRootRoute } = await import('@tanstack/react-router');
  return { routeTree: createRootRoute() };
});
vi.mock('#web/features/errors/error-page', () => ({
  NotFound: () => null,
  RouteError: () => null,
}));

it('starts the stored session exchange as it builds the router, before any route loads', () => {
  getRouter();

  expect(H.ensureSession).toHaveBeenCalledTimes(1);
});

it('reads the module list as soon as the session exchange settles', async () => {
  getRouter();

  await vi.waitFor(() =>
    expect(H.prefetchModules).toHaveBeenCalledWith(H.runtime.queryClient, H.runtime.client),
  );
});
