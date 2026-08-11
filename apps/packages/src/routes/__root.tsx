import { SiteDocument, siteHead } from '@kroma/site-kit/site-document';
import { createRootRoute } from '@tanstack/react-router';
import appCss from '#site/styles.css?url';

export const Route = createRootRoute({
  head: () =>
    siteHead({
      appCss,
      title: 'KROMA package source',
      description:
        'Add KROMA to Synology Package Center: a live package source serving every release, stable and nightly.',
    }),
  shellComponent: SiteDocument,
});
