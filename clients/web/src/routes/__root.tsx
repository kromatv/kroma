import { ConfirmHost } from '@kroma/ui/kit';
import bricolageLatin from '@kroma/ui/src/assets/fonts/bricolage-grotesque-latin.woff2?url';
import hankenLatin from '@kroma/ui/src/assets/fonts/hanken-grotesk-latin.woff2?url';
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense } from 'react';
import { preload } from 'react-dom';
import { Intro } from '#web/features/catalog/intro';
import { NotificationBell } from '#web/features/notifications/panel';
import { ModuleHostProvider } from '#web/modules/ModuleHostProvider';
import { AuthProvider } from '#web/shared/lib/auth';
import { LocaleProvider } from '#web/shared/lib/locale';
import { MyListProvider } from '#web/shared/lib/mylist';
import { queryClient } from '#web/shared/lib/query';
import { WatchedProvider } from '#web/shared/lib/watched';
import { NavActionsProvider } from '#web/shared/ui/nav-actions';
import appCss from '#web/styles.css?url';

// Dev-only: lazy so the devtools bundle never ships in the packaged SPA.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
    )
  : () => null;

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // No apiBase injection: the SPA resolves the API origin at runtime (same origin
  // in the packaged build, VITE_KROMA_SERVER in dev see lib/api `apiBase`).
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      // viewport-fit=cover extends the canvas under the iPhone notch/home
      // indicator so `env(safe-area-inset-*)` paddings (player, topbar) apply.
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'KROMA' },
    ],
    links: [
      // The two font faces are preloaded from the shell instead (see below):
      // stated here as well, they emit a second, duplicate pair of tags.
      { rel: 'stylesheet', href: appCss },
      // The chromatic-wheel symbol; SVG first, PNG fallback for Safari & co.
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      // Makes the app installable which is also what unlocks Web Push on iOS,
      // where notifications only work from a home-screen install.
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  // React hoists a `data-precedence` stylesheet to the top of the head, and a
  // <link rel="preload"> rendered through <HeadContent> is not hoisted at all,
  // so the route's own links land after the stylesheet and every modulepreload.
  // `preload()` puts the face in React's font bucket, which is emitted first.
  // `font-display: optional` has no swap period, so arriving late is the same
  // as never arriving.
  for (const href of [hankenLatin, bricolageLatin]) {
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  }
  return (
    // `lang` is the SSR default; LocaleProvider updates it client-side to match
    // the active locale (account preference → device → browser).
    // The app is dark-only for now: an unstamped root is the `system` choice and
    // would follow prefers-color-scheme into a light palette nothing here has
    // been designed against.
    <html lang="fr" data-theme="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <WatchedProvider>
              <MyListProvider>
                <LocaleProvider>
                  <NavActionsProvider actions={<NotificationBell />}>
                    <ModuleHostProvider>{children}</ModuleHostProvider>
                  </NavActionsProvider>
                </LocaleProvider>
              </MyListProvider>
            </WatchedProvider>
          </AuthProvider>
          <Intro />
          <ConfirmHost />
          <Suspense fallback={null}>
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </Suspense>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
