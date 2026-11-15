import type { ReactNode } from 'react';
import { createTvEngine, planEngine } from '#tv/features/playback/browser/backend';
import { PlayerSurface } from '#tv/features/playback/browser/player-surface.component';
import { browserPictureInPicture } from '#tv/features/playback/browser/surface-pip';
import {
  type PlaybackBackend,
  PlaybackBackendProvider,
} from '#tv/features/playback/player/playback-backend';
import { TvPlayer } from '#tv/features/playback/tv-player.component';

const BROWSER_BACKEND: PlaybackBackend = {
  planEngine,
  createTvEngine,
  Surface: PlayerSurface,
  pictureInPicture: browserPictureInPicture,
};

/** The player screen on the browser shells: a `<video>`, AVPlay or mpv. */
export function BrowserPlayer(): ReactNode {
  return (
    <PlaybackBackendProvider value={BROWSER_BACKEND}>
      <TvPlayer />
    </PlaybackBackendProvider>
  );
}
