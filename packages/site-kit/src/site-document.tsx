import bricolageLatin from '@kroma/ui/src/assets/fonts/bricolage-grotesque-latin.woff2?url';
import hankenLatin from '@kroma/ui/src/assets/fonts/hanken-grotesk-latin.woff2?url';
import { HeadContent, Scripts } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';

// `crossOrigin` is load-bearing: a font fetched without it does not match the
// preload and is requested twice.
const FONT_PRELOAD = [hankenLatin, bricolageLatin].map((href) => ({
  rel: 'preload',
  href,
  as: 'font',
  type: 'font/woff2',
  crossOrigin: 'anonymous' as const,
}));

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
      ...FONT_PRELOAD,
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ...links,
    ],
  };
}

/** The `<html>` shell every KROMA site renders into. */
export function SiteDocument({ children }: Readonly<{ children: ReactNode }>) {
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
