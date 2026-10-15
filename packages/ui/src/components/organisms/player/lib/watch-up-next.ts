import { formatRuntime, type WatchNext, watchNextId } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import type { CreditsCardItem } from '../parts/credits-card';
import type { UpNextData, UpNextItem } from '../parts/up-next-sheet';

export interface WatchUpNext {
  next: CreditsCardItem | null;
  data: UpNextData;
}

export interface WatchUpNextOptions {
  t: Translate;
  art: (stillUrl: string | null) => string | null;
}

function card(next: WatchNext, { t, art }: WatchUpNextOptions): UpNextItem {
  const tag = `S${next.season} E${next.episode}`;
  const runtime = next.runtimeMin ? formatRuntime(next.runtimeMin * 60_000) : '';
  return {
    id: watchNextId(next),
    title: next.title ?? t('content.episodeN', { n: next.episode }),
    subtitle: runtime ? `${tag} · ${runtime}` : tag,
    posterUrl: art(next.stillUrl),
  };
}

/** `following` drawn as the catalogue draws the episodes after the one playing:
 * TMDB's title, else the episode's number. */
export function watchUpNext(
  following: readonly WatchNext[],
  opts: Readonly<WatchUpNextOptions>,
): WatchUpNext {
  const cards = following.map((next) => card(next, opts));
  const [first] = following;
  const [shown] = cards;
  return {
    next:
      first && shown
        ? {
            title: shown.title,
            subtitle: `S${first.season} E${first.episode}`,
            posterUrl: shown.posterUrl,
          }
        : null,
    data: { nextEpisodes: cards, recommendations: [] },
  };
}
