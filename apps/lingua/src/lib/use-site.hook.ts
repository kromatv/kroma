import { rootRouteId, useMatch } from '@tanstack/react-router';
import type { SiteView } from '#site/lib/views';

/** The chrome the root route loaded, or undefined on an error page whose load never finished. */
export function useSite(): SiteView | undefined {
  return useMatch({ from: rootRouteId, shouldThrow: false, select: (match) => match.loaderData });
}
