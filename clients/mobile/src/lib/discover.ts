import type { KromaClient } from '@kromatv/client';
import { type DiscoverEntry, tmdbKindOf } from '@kromatv/client/discovery';
import { sizedImageUrl } from '@kromatv/core';
import type { CardModel } from '#mobile/components/cards';

export function discoverCard(entry: DiscoverEntry, client: KromaClient, width: number): CardModel {
  return {
    key: `tmdb:${entry.tmdbId}`,
    title: entry.title,
    subtitle: entry.year ? String(entry.year) : undefined,
    poster: sizedImageUrl(client.media.artwork.resolve(entry.posterUrl), width),
    route: `/discover/${tmdbKindOf(entry.kind)}/${entry.tmdbId}`,
  };
}
