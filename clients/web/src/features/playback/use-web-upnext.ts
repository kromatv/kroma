import {
  formatRuntime,
  genreLabels,
  ItemId,
  type MediaItem,
  metaLine,
  type Translate,
} from '@kroma/core';
import {
  POST_PLAY_ART_W,
  type PostPlayItem,
  UP_NEXT_ART_W,
  type UpNextData,
  type UpNextItem,
} from '@kroma/ui';
import { useEffect, useMemo, useState } from 'react';
import { kromaClient } from '#web/shared/lib/api';

function toCard(t: Translate, item: MediaItem): UpNextItem {
  const c = kromaClient();
  const isEp = item.season != null && item.episode != null;
  return {
    id: item.id,
    title: isEp ? (item.episodeTitle ?? item.title) : item.title,
    subtitle: isEp
      ? `S${item.season} E${item.episode} · ${formatRuntime(item.durationMs)}`
      : metaLine(item),
    posterUrl:
      c.media.artwork.backdropFor(item, UP_NEXT_ART_W) ??
      c.media.artwork.posterFor(item, UP_NEXT_ART_W),
    categoryLabel: genreLabels(t, item.metadata)[0],
  };
}

function toOffer(item: MediaItem): PostPlayItem {
  const c = kromaClient();
  return {
    id: item.id,
    title: item.title,
    subtitle: metaLine(item),
    rating: item.metadata?.rating,
    overview: item.metadata?.overview,
    artUrl:
      c.media.artwork.backdropFor(item, POST_PLAY_ART_W) ??
      c.media.artwork.posterFor(item, POST_PLAY_ART_W),
  };
}

// Stable empty default so the memo below doesn't recompute for a movie.
const NO_EPISODES: MediaItem[] = [];

/** The up-next data plus the one film the end of this one offers. */
export interface WebUpNext {
  data: UpNextData;
  postPlay: PostPlayItem | null;
}

/**
 * "À suivre" data (§10) for the web player: the upcoming episodes plus
 * content-similar recommendations, mapped to the shared up-next card shape,
 * and the nearest neighbour as the film the end of this one offers.
 */
export function useWebUpNext(
  t: Translate,
  item: MediaItem,
  following: MediaItem[] = NO_EPISODES,
): WebUpNext {
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  // Recommend against the SHOW when watching an episode: episodes carry no
  // embedding of their own, so similar(episodeId) would be empty.
  const recoId = item.showId ?? item.id;
  useEffect(() => {
    let cancelled = false;
    kromaClient()
      .media.similar(ItemId.parse(recoId))
      .then((list) => !cancelled && setSimilar(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [recoId]);

  return useMemo(() => {
    // A library that holds the same film twice answers itself as its own
    // nearest neighbour, and offering what just finished is worse than offering
    // nothing.
    const offer = similar.find((s) => s.id !== item.id) ?? null;
    return {
      data: {
        nextEpisodes: following.map((e) => toCard(t, e)),
        recommendations: similar.slice(0, 18).map((s) => toCard(t, s)),
      },
      postPlay: offer ? toOffer(offer) : null,
    };
  }, [t, item.id, following, similar]);
}
