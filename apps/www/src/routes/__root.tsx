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
import { THEME_BOOTSTRAP } from '#site/lib/theme';
import appCss from '#site/styles.css?url';

export const Route = createRootRoute({
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
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a literal, and it has to run before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
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
