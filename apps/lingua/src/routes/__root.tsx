import { SiteDocument, siteHead } from '@kromatv/site-kit/site-document';
import appCss from '@kromatv/ui/css?url';
import { createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () =>
    siteHead({
      appCss,
      title: 'Lingua',
      description:
        'Translate a project in the browser: sign in with GitHub, fix or add a language, and your edits reach the repository as a pull request.',
    }),
  shellComponent: SiteDocument,
});
