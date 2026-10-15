import type { KromaClient } from '@kromatv/client';
import { type DiscoverEntry, tmdbKindOf } from '@kromatv/client/discovery';
import { sizedImageUrl, type WatchableTarget, type WatchSubject } from '@kromatv/core';
import { useWatchSources, type WatchSources } from '@kromatv/core/react';
import type { CardModel } from '#mobile/components/cards';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';

export function useWatchable(): WatchSources {
  return useWatchSources(useClient(), useT());
}

export function watchableCard(
  { entry, file }: WatchableTarget,
  client: KromaClient,
  width: number,
): CardModel {
  return {
    key: `${entry.id}:${file.index}`,
    title: entry.title ?? file.name,
    subtitle: entry.year ? String(entry.year) : undefined,
    poster: sizedImageUrl(client.media.artwork.resolve(entry.posterUrl), width),
    route: `/watch/${entry.id}?file=${file.index}`,
  };
}

export function watchSubjectRoute(subject: WatchSubject): string {
  if (subject.kind === 'download') {
    const file = subject.file === null ? '' : `?file=${subject.file}`;
    return `/watch/${subject.downloadId}${file}`;
  }
  const { kind, tmdbId, season, episode } = subject.title;
  const at = season === null || episode === null ? '' : `?season=${season}&episode=${episode}`;
  return `/watch/title/${tmdbKindOf(kind)}/${tmdbId}${at}`;
}

export function discoverCard(entry: DiscoverEntry, client: KromaClient, width: number): CardModel {
  return {
    key: `tmdb:${entry.tmdbId}`,
    title: entry.title,
    subtitle: entry.year ? String(entry.year) : undefined,
    poster: sizedImageUrl(client.media.artwork.resolve(entry.posterUrl), width),
    route: `/discover/${tmdbKindOf(entry.kind)}/${entry.tmdbId}`,
  };
}
