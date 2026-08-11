// Navigation escape hatch: GO_BACK with an empty stack (a cold-start deep
// link, a restored session whose first screen is a leaf like the player) is
// an unhandled action, so with nothing to pop it lands on Home instead.

import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

export function goBack(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.replace('/' as never);
}

/**
 * A dynamic segment, or null when the path carried nothing usable.
 *
 * `/item/${id}` with an absent id is a REAL path: the template interpolates the
 * string "undefined", which matches `[id]` and opens a detail screen for a title
 * that cannot exist. A deep link and a notification can carry the same.
 */
export function routeParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || first === 'undefined' || first === 'null') return null;
  return first;
}
