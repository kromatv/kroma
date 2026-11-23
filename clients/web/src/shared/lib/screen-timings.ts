import { monotonicNow } from '@kromatv/client';

/** What screen timing needs of the router: its navigation events and the route
 *  it landed on. */
export interface Navigations {
  subscribe(event: 'onBeforeNavigate' | 'onRendered', listener: () => void): () => void;
  readonly state: { readonly matches: readonly { readonly routeId: string }[] };
}

/** Reports each screen the router draws, named by the route it landed on, timed
 *  from the navigation that asked for it (the first from the page's start).
 *  Returns the unsubscribe. */
export function reportScreenTimings(
  router: Navigations,
  report: (name: string, ms: number) => void,
  now: () => number = monotonicNow,
): () => void {
  let askedAt = 0;
  const stopAsking = router.subscribe('onBeforeNavigate', () => {
    askedAt = now();
  });
  const stopDrawing = router.subscribe('onRendered', () => {
    const route = router.state.matches.at(-1)?.routeId;
    if (route) {
      report(`web ${route}`, now() - askedAt);
    }
  });
  return () => {
    stopAsking();
    stopDrawing();
  };
}
