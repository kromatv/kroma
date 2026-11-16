import type { ReactNode } from 'react';
import { ClipSurface } from '#tv/features/playback/native/clip-surface.component';
import type { ClipBackend } from '#tv/features/playback/player/clip-backend';
import { ExpoClipEngine } from '#tv/features/playback/player/expo-clip-engine';
import { TvTrailerPlayer } from '#tv/features/playback/tv-trailer-player.component';

const NATIVE_CLIP: ClipBackend<ExpoClipEngine> = {
  createClipEngine: ({ url, listeners }) => new ExpoClipEngine(url, listeners),
  Surface: ClipSurface,
};

/** The trailer screen on the native shells, on expo-video's platform player. */
export function NativeTrailer(): ReactNode {
  return <TvTrailerPlayer backend={NATIVE_CLIP} />;
}
