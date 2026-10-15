import { TmdbKind } from '@kromatv/client/discovery';
import { watchableTitle } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import type { QueryClient } from '@tanstack/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { redirect, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { WatchableWatch } from '#web/features/playback/watchable-watch';
import { imageUrl, isAuthed } from '#web/shared/lib/api';
import { discoverQueries } from '#web/shared/lib/queries';
import type { EpisodeAt } from '#web/shared/lib/watch-route';

const TmdbId = z.coerce.number().int().positive();

export async function loadWatchable(
  queryClient: QueryClient,
  params: Readonly<{ type: string; tmdbId: string }>,
  at: EpisodeAt | null = null,
): Promise<void> {
  if (!isAuthed()) throw redirect({ to: '/' });
  const tmdbId = TmdbId.safeParse(params.tmdbId);
  const type = TmdbKind.safeParse(params.type);
  if (!(tmdbId.success && type.success)) {
    throw redirect({ to: '/search', search: { q: '', type: 'all' } });
  }
  const detail = await queryClient.ensureQueryData(discoverQueries.detail(type.data, tmdbId.data));
  if (detail.localId) {
    throw redirect({
      to: type.data === 'tv' ? '/shows/$id' : '/watch/$id',
      params: { id: detail.localId },
      replace: true,
    });
  }
  if (!watchableTitle(detail, at)) {
    throw redirect({
      to: '/discover/$type/$tmdbId',
      params: { type: type.data, tmdbId: params.tmdbId },
      replace: true,
    });
  }
}

export function TmdbWatch({
  type,
  tmdbId,
  at,
}: Readonly<{ type: TmdbKind; tmdbId: number; at: EpisodeAt | null }>) {
  const t = useT();
  const { data: detail } = useSuspenseQuery(discoverQueries.detail(type, tmdbId));
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const film = watchableTitle(detail, at);
  const leave = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    navigate({ to: '/discover/$type/$tmdbId', params: { type, tmdbId: String(tmdbId) } });
  };

  if (!film) return null;
  return (
    <WatchableWatch
      subject={{ kind: 'title', title: film }}
      title={
        at
          ? [
              detail.title,
              t('content.season', { number: at.season }),
              t('content.episodeN', { n: at.episode }),
            ].join(' · ')
          : detail.title
      }
      art={imageUrl(detail.backdropUrl) ?? imageUrl(detail.posterUrl)}
      onClose={leave}
    />
  );
}
