import { site } from '@kroma/site-meta';
import bricolageLatin from '@kroma/ui/src/assets/fonts/bricolage-grotesque-latin.woff2?url';
import hankenLatin from '@kroma/ui/src/assets/fonts/hanken-grotesk-latin.woff2?url';
import { colors } from '@kroma/ui/tokens';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { SiteFooter } from '#site/components/site-footer';
import { SiteHeader } from '#site/components/site-header';
import { useLang } from '#site/lib/i18n';
import appCss from '#site/styles.css?url';

export const Route = createRootRoute({
  // Only the language-neutral base head lives here. Each page owns its title,
  // description, canonical URL, hreflang alternates and per-page Open Graph via
  // seo(lang), so those are never emitted twice.
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: colors.bg },
      // No og:* here: Open Graph is keyed by `property`, not `name`, and
      // seo() already emits the real `property="og:site_name"` per page.
      { title: site.name },
    ],
    links: [
      // The two faces are preloaded from the shell instead, which is the only
      // way they land ahead of the stylesheet; stated here as well they emit a
      // second, duplicate pair of tags.
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  // The shell renders inside the router, so the active locale is known from the
  // URL at prerender time: `/en/*` documents ship `<html lang="en">`.
  const lang = useLang();
  // React hoists a `data-precedence` stylesheet to the top of the head, and a
  // <link rel="preload"> rendered through <HeadContent> is not hoisted at all,
  // so the route's own links land after the stylesheet. `preload()` puts the
  // face in React's font bucket, which is emitted first. `font-display:
  // optional` has no swap period, so arriving late is the same as never.
  for (const href of [hankenLatin, bricolageLatin]) {
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  }
  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body className="page-grain bg-bg text-text antialiased">
        <div className="relative z-10 flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
        <Scripts />
      </body>
    </html>
  );
}
