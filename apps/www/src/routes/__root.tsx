import { site } from '@kroma/site-meta';
import { colors } from '@kroma/ui/tokens';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
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
