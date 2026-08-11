import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from '#site/routeTree.gen';
import { setEntryDefaults } from '#ui/lib/field-shell';

setEntryDefaults({ physicalKeyboard: true });

export function getRouter() {
  return createTanStackRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
