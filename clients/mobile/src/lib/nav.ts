// Navigation escape hatch: GO_BACK with an empty stack (a cold-start deep
// link, a restored session whose first screen is a leaf like the player) is an
// unhandled action - a console error in dev and a dead button in production.
// "Back" must always go SOMEWHERE, so with nothing to pop it lands on Home.

import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

export function goBack(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.replace('/' as never);
}
