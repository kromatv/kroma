import { setEntryDefaults } from '@kroma/ui/kit';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { NotFound, RouteError } from '#web/features/errors/error-page';
import { routeTree } from '#web/routeTree.gen';
import { queryClient } from '#web/shared/lib/query';

// A mouse-and-keyboard page, so real inputs rather than the TV caret form.
setEntryDefaults({ physicalKeyboard: true, size: 'sm' });

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
    context: { queryClient },
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
