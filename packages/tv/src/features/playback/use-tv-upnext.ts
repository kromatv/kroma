import {
  formatRuntime,
  genreLabels,
  type KromaClient,
  type MediaItem,
  metaLine,
  type Translate,
} from '@kroma/core';
import { UP_NEXT_ART_W, type UpNextData, type UpNextItem } from '@kroma/ui';
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
    posterUrl: client.backdropFor(item, UP_NEXT_ART_W) ?? client.posterFor(item, UP_NEXT_ART_W),
    categoryLabel: genreLabels(t, item.metadata)[0],
  };
}

export interface TvUpNext {
  data: UpNextData;
  byId: Map<string, MediaItem>;
}

// A stable reference, so the memo below does not recompute for a movie.
const NO_EPISODES: MediaItem[] = [];

/** Up-next data for the TV player: upcoming episodes and recommendations, with an
 * id -> item map so a chosen card can be handed to the router. */
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
    client
      .similar(recoId)
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
    return {
      data: {
        nextEpisodes: following.map((e) => toCard(client, t, e)),
        recommendations: recos.map((s) => toCard(client, t, s)),
      },
      byId,
    };
  }, [client, t, following, similar]);
}
