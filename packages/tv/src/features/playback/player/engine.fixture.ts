import { MediaItem } from '@kromatv/client/media';
import { vi } from 'vitest';
import type { EngineListeners } from '#tv/features/playback/player/engine';

export function fakeListeners(): EngineListeners {
  return {
    onTime: vi.fn(),
    onDuration: vi.fn(),
    onBuffered: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onWaiting: vi.fn(),
    onPlaying: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    onReady: vi.fn(),
    onAspect: vi.fn(),
    onSurfaceChange: vi.fn(),
  };
}

/** A movie as the catalogue sends it: an AVI the native players do not open, so
 * it plays through the server's master. */
export function movie(id: string): MediaItem {
  return MediaItem.parse({
    id,
    kind: 'movie',
    title: 'Clock',
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
    container: 'avi',
    durationMs: 360_000,
    relPath: null,
    audio: null,
    audioTracks: [],
    subtitles: [],
    files: [],
  });
}
