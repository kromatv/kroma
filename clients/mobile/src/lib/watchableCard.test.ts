import type { KromaClient } from '@kromatv/client';
import type { DiscoverEntry } from '@kromatv/client/discovery';
import { DownloadId } from '@kromatv/client/watchable';
import type { WatchableTarget } from '@kromatv/core';
import { describe, expect, it } from 'vitest';
import { discoverCard, watchableCard, watchSubjectRoute } from '#mobile/lib/watchable';

const client = {
  media: { artwork: { resolve: (url?: string | null) => url ?? null } },
} as unknown as KromaClient;

const target = (over: Partial<WatchableTarget['entry']> = {}): WatchableTarget =>
  ({
    entry: {
      id: DownloadId.parse('dl_1'),
      title: 'Sintel',
      year: 2010,
      posterUrl: '/art/sintel.jpg',
      ...over,
    },
    file: { index: 7, name: 'Sintel.2010.1080p.mkv' },
  }) as unknown as WatchableTarget;

describe('a download on the phone home', () => {
  it('opens the file at the index the torrent gave it, not its place in the list', () => {
    expect(watchableCard(target(), client, 200).route).toBe('/watch/dl_1?file=7');
  });

  it('falls back to the file name where the module named no title', () => {
    expect(watchableCard(target({ title: null }), client, 200).title).toBe('Sintel.2010.1080p.mkv');
  });

  it('carries the year and the artwork the module answered with', () => {
    const card = watchableCard(target(), client, 200);

    expect(card.subtitle).toBe('2010');
    expect(card.poster).toBe('/art/sintel.jpg');
  });
});

const entry = (over: Partial<DiscoverEntry> = {}): DiscoverEntry =>
  ({
    kind: 'movie',
    tmdbId: 45_745,
    title: 'Sintel',
    year: 2010,
    posterUrl: '/art/sintel.jpg',
    ...over,
  }) as unknown as DiscoverEntry;

describe('a title the phone found beyond the library', () => {
  it('opens the discovery page of a film under the route vocabulary', () => {
    expect(discoverCard(entry(), client, 200).route).toBe('/discover/movie/45745');
  });

  it('opens a series under the same vocabulary the discovery routes are spelled in', () => {
    expect(discoverCard(entry({ kind: 'show' }), client, 200).route).toBe('/discover/tv/45745');
  });

  it('keys itself apart from a library card of the same number', () => {
    expect(discoverCard(entry(), client, 200).key).toBe('tmdb:45745');
  });
});

describe('the route of the next episode', () => {
  it('opens a file of the same download by its index', () => {
    const subject = { kind: 'download', downloadId: DownloadId.parse('dl_1'), file: 1 } as const;

    expect(watchSubjectRoute(subject)).toBe('/watch/dl_1?file=1');
  });

  it('starts an episode the download does not hold through the watch route', () => {
    const title = {
      tmdbId: 11466,
      kind: 'show',
      title: 'Kaamelott',
      year: 2005,
      season: 1,
      episode: 3,
    } as const;

    expect(watchSubjectRoute({ kind: 'title', title })).toBe(
      '/watch/title/tv/11466?season=1&episode=3',
    );
  });
});
