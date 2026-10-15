import { posterColors, watchableTargets } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { MediaCard } from '@kromatv/ui/kit';
import { type ReactNode, useEffect } from 'react';
import { useWatchable } from '#tv/app/providers/watchable';
import { useClient, useNav } from '#tv/app/router';

const TILE_W = 320;
const ARRIVING_MS = 10_000;

export function useWatchCards(): { title: string; cards: ReactNode[] } | null {
  const { api, entries, refresh } = useWatchable();
  const client = useClient();
  const { go } = useNav();
  const t = useT();

  useEffect(() => {
    if (!api) return;
    refresh();
    const timer = setInterval(refresh, ARRIVING_MS);
    return () => clearInterval(timer);
  }, [api, refresh]);

  const targets = watchableTargets(entries);
  if (!api || targets.length === 0) return null;
  return {
    title: t('requests.watchNow'),
    cards: targets.map((target) => {
      const { entry, file } = target;
      return (
        <MediaCard
          key={`${entry.id}:${file.index}`}
          title={entry.title ?? file.name}
          overline={entry.kind === 'show' ? t('content.series') : t('content.film')}
          art={client.media.artwork.resolve(entry.posterUrl, TILE_W)}
          tint={posterColors(entry.id)}
          progress={entry.progress}
          onPress={() =>
            go('watch', {
              subject: { kind: 'download', downloadId: entry.id, file: file.index },
              poster: entry.posterUrl,
            })
          }
        />
      );
    }),
  };
}
