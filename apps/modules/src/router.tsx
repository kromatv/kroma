import { configureKit } from '@kromatv/ui/kit';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from '#site/routeTree.gen';

configureKit({ formFactor: 'browser', entry: { size: 'md' } });

export function getRouter() {
  return createTanStackRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
