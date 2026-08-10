import { sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { SplashBackdrop } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { serverQueries } from '#web/shared/lib/queries';

/** The gate's ambient slideshow: the public `/api/splash` sample mapped onto
 * the kit's universal splash backdrop, so the web gate, the phone and the TV
 * all dress their sign-in the same way. A browser that reaches a server with
 * no artwork renders nothing, leaving the gate's radial. */
export function LoginBackdrop() {
  const t = useT();
  const { data: entries = [] } = useQuery(serverQueries.splash());
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
