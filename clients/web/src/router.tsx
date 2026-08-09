import { setEntryDefaults } from '@kroma/ui/kit';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { NotFound, RouteError } from '#web/features/errors/error-page';
import { routeTree } from '#web/routeTree.gen';
import { queryClient } from '#web/shared/lib/query';

// The console is a mouse-and-keyboard page read at arm's length: real inputs
// rather than the TV caret form, and the compact control shell, stated once so
// every kit control on a row is the same shape and height.
setEntryDefaults({ physicalKeyboard: true, size: 'sm' });

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Branded full-page fallbacks: unmatched routes → 404, and any thrown
    // loader/render error → a status-aware screen (401 / 403 / 500).
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
    // Exposed to loaders as `context.queryClient` for `ensureQueryData` prefetch;
    // the same singleton backs in-component `useSuspenseQuery` reads, so a loader
    // prefetch and the component read hit one cache entry (no double fetch). The
    // <QueryClientProvider> in __root uses this same instance. SPA mode runs
    // loaders on the client, so no SSR dehydration bridge is needed.
    context: { queryClient },
    // Data resolves via TanStack Query + Suspense now, so a cached page shows
    // instantly on back-nav while it refetches in the background.
    defaultPreloadStaleTime: 0,
    // Skeleton (`pendingComponent`) appears fast on a real fetch but not on a
    // warm-cache navigation; `defaultPendingMinMs` stops it flashing when the
    // fetch resolves a moment later.
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
