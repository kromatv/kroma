import { createFileRoute } from '@tanstack/react-router';
import { NotFound } from '#site/components/not-found';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

// A real route, so the build can prerender the 404 document: the
// prerenderer refuses to write a non-ok response, so `defaultNotFoundComponent`
// alone leaves no 404.html and Cloudflare serves the home page with a 200 for
// every unknown URL. Reached as a route, the build writes 404.html (and
// fr/404.html), and Cloudflare's `404-page` handling attaches the status. See
// wrangler.jsonc. `noindex` since this document now has its own URL.
export const Route = createFileRoute('/404')({
  head: () => {
    const head = seo({ lang: getLocale(), title: m.notfound_code(), path: '/404' });
    return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] };
  },
  component: NotFound,
});
