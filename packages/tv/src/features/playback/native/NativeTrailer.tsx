import type { ReactNode } from 'react';
import { ClipSurface } from '#tv/features/playback/native/ClipSurface';
import type { ClipBackend } from '#tv/features/playback/player/clipBackend';
import { ExpoClipEngine } from '#tv/features/playback/player/expoClipEngine';
import { TvTrailerPlayer } from '#tv/features/playback/TvTrailerPlayer';

const NATIVE_CLIP: ClipBackend<ExpoClipEngine> = {
  createClipEngine: ({ url, listeners }) => new ExpoClipEngine(url, listeners),
  Surface: ClipSurface,
};

/** The trailer screen on the native shells, on expo-video's platform player. */
export function NativeTrailer(): ReactNode {
  return <TvTrailerPlayer backend={NATIVE_CLIP} />;
}
