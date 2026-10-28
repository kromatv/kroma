// Loaded with everything else. Metro does not code-split a production bundle, so
// `import()` buys nothing there. In development it's worse: a dynamic import is
// a lazy bundle fetch from the dev server, and throws outright when the HMR
// client isn't connected ("Render Error: Expected HMRClient.setup() call at
// startup"), which raised a red box on Apple TV instead of the player every
// time the Metro server had dropped. See TvQuickConnect for the same trap.

import type { ReactNode } from 'react';
import { createTvEngine, planEngine } from '#tv/features/playback/native/backend';
import { PlayerSurface } from '#tv/features/playback/native/PlayerSurface';
import { nativePictureInPicture } from '#tv/features/playback/native/pip';
import {
  type PlaybackBackend,
  PlaybackBackendProvider,
  type PlaybackPlatform,
} from '#tv/features/playback/player/playbackBackend';
import { TvPlayer } from '#tv/features/playback/TvPlayer';

const NATIVE_BACKEND: PlaybackBackend = {
  planEngine,
  createTvEngine,
  Surface: PlayerSurface,
  pictureInPicture: nativePictureInPicture,
};

function NativePlayer(): ReactNode {
  return (
    <PlaybackBackendProvider value={NATIVE_BACKEND}>
      <TvPlayer />
    </PlaybackBackendProvider>
  );
}

/** Playback on the native shells: expo-video or VLC, loaded eagerly. */
export const NATIVE_PLAYBACK: PlaybackPlatform = { Player: NativePlayer };
