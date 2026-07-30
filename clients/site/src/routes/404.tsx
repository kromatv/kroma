import { createFileRoute } from '@tanstack/react-router';
import { NotFound } from '#site/components/not-found';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

// A real route, so the build can PRERENDER the 404 document.
//
// The router's own `defaultNotFoundComponent` renders the same component, but it answers
// with a 404 status - and the prerenderer refuses to write a non-ok response, so there was
// no 404.html to serve and Cloudflare fell back to the app shell: every unknown URL
// returned the home page with a 200, which is a soft 404 and duplicate content at
// unlimited addresses. Reached as a route this renders with a 200, the build writes
// `404.html` (and `fr/404.html`), and Cloudflare's `404-page` handling is what attaches
// the 404 status when it serves the file. See wrangler.jsonc.
//
// `noindex` because this document has its own URL now, and that URL is not a page anyone
// should land on from a search result.
export const Route = createFileRoute('/404')({
  head: () => {
    const head = seo({ lang: getLocale(), title: m.notfound_code(), path: '/404' });
    return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] };
  },
  component: NotFound,
});
