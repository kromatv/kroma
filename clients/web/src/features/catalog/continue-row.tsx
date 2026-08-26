// "Reprendre la lecture" rail. Unlike the catalogue rails (SSR-loaded, public),
// this is per-user so it loads client-side once a session is hydrated, then
// renders resumable items with a progress bar straight to the player.

import { episodeTag, posterColors } from '@kroma/core';
import { useT } from '@kroma/ui';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { SectionHeading } from '#web/features/catalog/cards';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';
import { Poster, PosterRail, RailSkeleton } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

export function ContinueRow() {
  const { user, ready } = useAuth();
  // Per-user data: don't fetch behind the login gate. A skeleton fills the rail
  // while it loads, then collapses to nothing if there's nothing to resume.
  if (!ready || !user) return null;
  return (
    <Suspense fallback={<RailSkeleton count={6} />}>
      <ContinueRail />
    </Suspense>
  );
}

function ContinueRail() {
  const t = useT();
  const { client } = useAuth();
  const { data: items } = useSuspenseQuery(userQueries.continueWatching());

  if (items.length === 0) return null;

  return (
    <section>
      <SectionHeading>{t('content.continueWatching')}</SectionHeading>
      <PosterRail
        data={items}
        renderItem={({ item, positionMs, durationMs }) => {
          const dur = durationMs ?? item.durationMs ?? 0;
          const pct = dur > 0 ? Math.min(100, Math.round((positionMs / dur) * 100)) : 0;
          const label =
            item.kind === 'episode' && item.showTitle
              ? `${item.showTitle} · ${episodeTag(item)}`
              : t('content.film');
          return (
            <Poster
              title={item.title}
              genre={label}
              colors={posterColors(item.id)}
              poster={client.posterFor(item)}
              progress={pct}
              as={<RouteLink to="/watch/$id" params={{ id: item.id }} />}
            />
          );
        }}
      />
    </section>
  );
}
