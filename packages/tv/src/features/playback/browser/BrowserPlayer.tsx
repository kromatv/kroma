import type { ReactNode } from 'react';
import { createTvEngine, planEngine } from '#tv/features/playback/browser/backend';
import { PlayerSurface } from '#tv/features/playback/browser/PlayerSurface';
import {
  type PlaybackBackend,
  PlaybackBackendProvider,
} from '#tv/features/playback/player/playbackBackend';
import { TvPlayer } from '#tv/features/playback/TvPlayer';

const BROWSER_BACKEND: PlaybackBackend = { planEngine, createTvEngine, Surface: PlayerSurface };

/** The player screen on the browser shells: a `<video>`, AVPlay or mpv. */
export function BrowserPlayer(): ReactNode {
  return (
    <PlaybackBackendProvider value={BROWSER_BACKEND}>
      <TvPlayer />
    </PlaybackBackendProvider>
  );
}
