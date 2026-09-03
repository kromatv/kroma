import type { KromaClient } from '@kroma/client';
import { ItemId, type MediaItem } from '@kroma/client/media';
import { formatRuntime, genreLabels, metaLine, type Translate } from '@kroma/core';
import {
  POST_PLAY_ART_W,
  type PostPlayItem,
  UP_NEXT_ART_W,
  type UpNextData,
  type UpNextItem,
} from '@kroma/ui';
import { useEffect, useMemo, useState } from 'react';

function toCard(client: KromaClient, t: Translate, item: MediaItem): UpNextItem {
  const isEp = item.season != null && item.episode != null;
  return {
    id: item.id,
    title: isEp ? (item.episodeTitle ?? item.title) : item.title,
    // The runtime belongs to this line and to nothing else: the card used to
    // print it again in a chip of its own.
    subtitle: isEp
      ? `S${item.season} E${item.episode} · ${formatRuntime(item.durationMs)}`
      : metaLine(item),
    posterUrl:
      client.media.artwork.backdropFor(item, UP_NEXT_ART_W) ??
      client.media.artwork.posterFor(item, UP_NEXT_ART_W),
    categoryLabel: genreLabels(t, item.metadata)[0],
  };
}

function toOffer(client: KromaClient, item: MediaItem): PostPlayItem {
  return {
    id: item.id,
    title: item.title,
    subtitle: metaLine(item),
    rating: item.metadata?.rating,
    overview: item.metadata?.overview,
    artUrl:
      client.media.artwork.backdropFor(item, POST_PLAY_ART_W) ??
      client.media.artwork.posterFor(item, POST_PLAY_ART_W),
  };
}

export interface TvUpNext {
  data: UpNextData;
  byId: Map<string, MediaItem>;
  /** The one film the end of this one offers, or null with nothing to offer. */
  postPlay: PostPlayItem | null;
}

// A stable reference, so the memo below does not recompute for a movie.
const NO_EPISODES: MediaItem[] = [];

/** Up-next data for the TV player: upcoming episodes and recommendations, with an
 * id -> item map so a chosen card can be handed to the router, and the nearest
 * neighbour as the film the end of this one offers. */
export function useTvUpNext(
  client: KromaClient,
  t: Translate,
  item: MediaItem,
  following: MediaItem[] = NO_EPISODES,
): TvUpNext {
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  // Episodes carry no embedding of their own, so recommend against the show.
  const recoId = item.showId ?? item.id;
  useEffect(() => {
    let cancelled = false;
    client.media
      .similar(ItemId.parse(recoId))
      .then((list) => !cancelled && setSimilar(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, recoId]);

  return useMemo(() => {
    const recos = similar.slice(0, 18);
    const byId = new Map<string, MediaItem>();
    for (const e of following) byId.set(e.id, e);
    for (const s of recos) byId.set(s.id, s);
    // A library that holds the same film twice answers itself as its own nearest
    // neighbour, and offering what just finished is worse than offering nothing.
    const offer = similar.find((s) => s.id !== item.id) ?? null;
    if (offer) byId.set(offer.id, offer);
    return {
      data: {
        nextEpisodes: following.map((e) => toCard(client, t, e)),
        recommendations: recos.map((s) => toCard(client, t, s)),
      },
      byId,
      postPlay: offer ? toOffer(client, offer) : null,
    };
  }, [client, t, item.id, following, similar]);
}
