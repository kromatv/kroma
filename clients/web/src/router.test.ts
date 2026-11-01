import { expect, it, vi } from 'vitest';
import { getRouter } from './router';

const H = vi.hoisted(() => ({ ensureSession: vi.fn(async () => {}) }));

vi.mock('#web/shared/lib/api', () => ({
  createWebRuntime: () => ({ ensureSession: H.ensureSession, queryClient: {} }),
}));
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
