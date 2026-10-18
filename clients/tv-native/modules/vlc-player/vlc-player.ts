// JS face of the libVLC plane. Android only, and optional, so a build without the
// native module (every Apple target) yields null rather than throwing.
//
// This player exists for what the platform decoder refuses: Media3 falls back to
// nothing, because its ExperimentalFfmpegVideoRenderer answers FORMAT_UNSUPPORTED
// for every format and returns a null decoder. VLC carries its own.

import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export interface VlcPlayerViewProps extends ViewProps {
  sourceUri?: string;
  /** Where to start, in milliseconds; applied as a seek once the demux is ready. */
  startMs?: number;
  paused?: boolean;
  /** Seek target in ms, acted on only when `seekNonce` changes. */
  seekMs?: number;
  seekNonce?: number;
  /** VLC's own track id, not an index; -1 leaves the track alone. */
  audioTrack?: number;
  /** 'off' | 'standard' | 'night' | 'boost'. */
  audioFilter?: string;
  /** Playback speed; 1 is normal. */
  rate?: number;
  onPlayerTime?: (e: {
    nativeEvent: {
      timeMs: number;
      lengthMs: number;
      /** Pictures libVLC decoded but could not show. */
      lostPictures?: number;
      displayedPictures?: number;
      /** Megabytes per second, straight from libVLC's media statistics. */
      inputBitrate?: number;
    };
  }) => void;
  onPlayerLoad?: (e: { nativeEvent: { lengthMs: number } }) => void;
  onPlayerState?: (e: { nativeEvent: { state: string; percent?: number } }) => void;
  onPlayerError?: (e: { nativeEvent: { message: string } }) => void;
}

const nativeModule = requireOptionalNativeModule<{ releaseAll: () => Promise<void> }>('VlcPlayer');

/** Null where the module is not built in, which is how a caller tests for it. */
export const VlcPlayerView: ComponentType<VlcPlayerViewProps> | null = nativeModule
  ? requireNativeView<VlcPlayerViewProps>('VlcPlayer')
  : null;

/** Tear down every live libVLC core now, rather than when React unmounts the
 * view. Safe to call when nothing is playing. */
export function releaseVlcPlayers(): void {
  void nativeModule?.releaseAll();
}
