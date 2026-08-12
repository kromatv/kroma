import bricolageLatin from '@kroma/ui/src/assets/fonts/bricolage-grotesque-latin.woff2?url';
import hankenLatin from '@kroma/ui/src/assets/fonts/hanken-grotesk-latin.woff2?url';
import { HeadContent, Scripts } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { preload } from 'react-dom';

/**
 * The `<head>` every KROMA site shares - font preloads, stylesheet and favicon -
 * around this site's own `title`, `description` and any extra `links`.
 */
export function siteHead({
  title,
  description,
  appCss,
  links = [],
}: Readonly<{
  title: string;
  description: string;
  appCss: string;
  links?: readonly JSX.IntrinsicElements['link'][];
}>) {
  return {
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0A0A0C' },
      { title },
      { name: 'description', content: description },
    ],
    links: [
      // The faces are preloaded from <SiteDocument> instead, which is the only
      // way they land ahead of the stylesheet; stated here as well they emit a
      // second, duplicate pair of tags.
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ...links,
    ],
  };
}

/** The `<html>` shell every KROMA site renders into. */
export function SiteDocument({ children }: Readonly<{ children: ReactNode }>) {
  // React hoists a `data-precedence` stylesheet to the top of the head, and a
  // <link rel="preload"> rendered through <HeadContent> is not hoisted at all,
  // so `siteHead`'s links land after the stylesheet and every modulepreload.
  // `preload()` puts the face in React's font bucket, which is emitted first.
  // `font-display: optional` has no swap period, so arriving late is the same
  // as never arriving.
  for (const href of [hankenLatin, bricolageLatin]) {
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
