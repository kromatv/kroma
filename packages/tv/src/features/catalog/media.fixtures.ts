import { MediaCard, MediaItem, Metadata, Show, type VideoTrack } from '@kromatv/client/media';
import type { z } from 'zod';

const COMMON = {
  year: null,
  library: 'lib',
  video: null,
  addedAt: '2026-01-01T00:00:00Z',
  metadata: null,
};

export const metadata = (over: Partial<z.input<typeof Metadata>> = {}) =>
  Metadata.parse({
    provider: 'tmdb',
    tmdbId: 1,
    title: null,
    overview: null,
    genres: [],
    tmdbUrl: '',
    ...over,
  });

export const video = (over: Partial<VideoTrack> = {}): VideoTrack => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  hdr: false,
  bitDepth: 8,
  ...over,
});

export const mediaCard = (over: Partial<z.input<typeof MediaCard>>) =>
  MediaCard.parse({ ...COMMON, title: '', id: 'm', kind: 'movie', durationMs: null, ...over });

export const mediaItem = (over: Partial<z.input<typeof MediaItem>>) =>
  MediaItem.parse({
    ...COMMON,
    title: '',
    id: 'm',
    kind: 'movie',
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

export const show = (over: Partial<z.input<typeof Show>>) =>
  Show.parse({ ...COMMON, title: '', id: 's', seasonCount: 1, episodeCount: 1, ...over });
