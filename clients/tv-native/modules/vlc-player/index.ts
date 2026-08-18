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
  onPlayerTime?: (e: { nativeEvent: { timeMs: number; lengthMs: number } }) => void;
  onPlayerLoad?: (e: { nativeEvent: { lengthMs: number } }) => void;
  onPlayerState?: (e: { nativeEvent: { state: string; percent?: number } }) => void;
  onPlayerError?: (e: { nativeEvent: { message: string } }) => void;
}

/** Null where the module is not built in, which is how a caller tests for it. */
export const VlcPlayerView: ComponentType<VlcPlayerViewProps> | null = requireOptionalNativeModule(
  'VlcPlayer',
)
  ? requireNativeView<VlcPlayerViewProps>('VlcPlayer')
  : null;
