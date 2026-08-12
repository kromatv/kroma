import { setEntryDefaults } from '@kroma/ui/kit';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from '#site/routeTree.gen';

setEntryDefaults({ physicalKeyboard: true });

export function getRouter() {
  return createTanStackRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
