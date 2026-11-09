import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { NotFound, RouteError } from '#web/features/errors/error-page';
import { prefetchModules } from '#web/modules/remotes';
import { routeTree } from '#web/routeTree.gen';
import { createWebRuntime } from '#web/shared/lib/api';

export function getRouter() {
  const runtime = createWebRuntime();
  void runtime.ensureSession().then(() => prefetchModules(runtime.queryClient, runtime.client));
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
    context: { runtime, queryClient: runtime.queryClient },
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
