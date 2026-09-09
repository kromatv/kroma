import { SiteDocument, siteHead } from '@kromatv/site-kit/site-document';
import appCss from '@kromatv/ui/css?url';
import { createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () =>
    siteHead({
      appCss,
      title: 'KROMA package source',
      description:
        'Add KROMA to Synology Package Center: a live package source serving every release, stable and canary.',
    }),
  shellComponent: SiteDocument,
});
