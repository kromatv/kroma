import { CastNowPlaying, CastReceiver } from '@kromatv/client/cast';
import { MediaItem } from '@kromatv/client/media';
import type { Cast } from '@kromatv/ui';
import type { z } from 'zod';

export function mediaItem(over: Partial<z.input<typeof MediaItem>> = {}): MediaItem {
  return MediaItem.parse({
    id: 'it1',
    title: 'Dune',
    kind: 'movie',
    year: null,
    library: 'lib',
    video: null,
    addedAt: '2026-01-01T00:00:00Z',
    metadata: null,
    showId: null,
    showTitle: null,
    season: null,
    episode: null,
    episodeEnd: null,
    episodeTitle: null,
    container: 'mkv',
    durationMs: null,
    relPath: null,
    audio: null,
    audioTracks: [],
    subtitles: [],
    files: [],
    ...over,
  });
}

export function nowPlaying(over: Partial<z.input<typeof CastNowPlaying>> = {}): CastNowPlaying {
  return CastNowPlaying.parse({
    item: mediaItem(),
    positionMs: 60_000,
    durationMs: 600_000,
    state: 'playing',
    ...over,
  });
}

export function receiver(over: Partial<z.input<typeof CastReceiver>> = {}): CastReceiver {
  return CastReceiver.parse({
    id: 'tv-salon-01',
    name: 'Salon',
    platform: 'Tizen',
    username: 'alice',
    network: 'LAN',
    ...over,
  });
}

export function castSession(over: Partial<Cast> = {}): Cast {
  return {
    receivers: [],
    waking: null,
    wakingNeedsPower: false,
    pairable: [],
    active: null,
    available: true,
    position: () => 0,
    select: () => undefined,
    playOn: () => Promise.resolve(null),
    send: () => Promise.resolve(null),
    error: null,
    ...over,
  };
}
