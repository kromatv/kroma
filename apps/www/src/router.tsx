import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { NotFound } from '#site/components/not-found';
import { deLocalizeUrl, localizeUrl } from '#site/paraglide/runtime';
import { routeTree } from '#site/routeTree.gen';

// A content site: no query client, no auth. Just the route tree, with `intent`
// preloading so a hovered link fetches its chunk before the click.
export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFound,
    // The locale lives in the URL, but the route tree does NOT: routes are
    // defined once, unlocalized (`/download`), and Paraglide rewrites around
    // them: `input` strips the prefix so /fr/download matches the /download
    // route, `output` puts it back so every generated href stays in the
    // reader's language.
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
