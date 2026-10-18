import { sizedImageUrl } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { SplashBackdrop } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The gate's ambient slideshow: the public `/api/splash` sample mapped onto
 * the kit's universal splash backdrop, so the web gate, the phone and the TV
 * all dress their sign-in the same way. A browser that reaches a server with
 * no artwork renders nothing, leaving the gate's radial. */
export function LoginBackdrop() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { data: entries = [] } = useQuery(webRuntime.queries.serverQueries.splash());
  const covers = useMemo(
    () =>
      entries.map((e) => ({
        // Full-bleed art: 960 is the widest rendition the server keeps, and a
        // backdrop master is only a TMDB w1280 anyway.
        url: sizedImageUrl(e.backdropUrl, 960) ?? e.backdropUrl,
        caption: [e.title, e.year].filter(Boolean).join(' · '),
        eyebrow: t(e.kind === 'show' ? 'content.series' : 'content.film'),
      })),
    [entries, t],
  );
  return <SplashBackdrop covers={covers} />;
}
