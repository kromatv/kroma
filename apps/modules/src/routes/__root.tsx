import { SiteDocument, siteHead } from '@kromatv/site-kit/site-document';
import appCss from '@kromatv/ui/css?url';
import { createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () =>
    siteHead({
      appCss,
      title: 'KROMA Modules',
      description:
        "The module registry for KROMA: downloads, indexers, VPN, transcription and more, installed straight from your server's admin.",
      // Autodiscovery: a server handed the site URL follows this to the catalog
      // (docs/module-registries.md).
      links: [{ rel: 'kroma-modules', href: '/registry.json' }],
    }),
  shellComponent: SiteDocument,
});
