import { version } from 'virtual:build-info';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { NotFound, RouteError } from '#web/features/errors/error-page.component';
import { prefetchModules } from '#web/modules/remotes';
import { routeTree } from '#web/routeTree.gen';
import { createWebRuntime } from '#web/shared/lib/api';
import { reportScreenTimings } from '#web/shared/lib/screen-timings';

export function getRouter() {
  const runtime = createWebRuntime({ app: { shell: 'web', version } });
  void runtime.ensureSession().then(() => prefetchModules(runtime.queryClient, runtime.client));
  const router = createTanStackRouter({
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
  reportScreenTimings(router, (name, ms) => runtime.client.timings.screen(name, ms));
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
