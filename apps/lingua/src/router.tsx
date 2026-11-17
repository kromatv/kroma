import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { PagePending } from '#site/components/page-pending.component';
import { routeTree } from '#site/routeTree.gen';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultPendingComponent: PagePending,
    defaultPendingMs: 250,
    defaultPendingMinMs: 300,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
