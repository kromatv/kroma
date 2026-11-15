import type { ComponentType } from 'react';

/** The cache window the plane opens libVLC with, in milliseconds. libVLC has no
 * absolute buffered-seconds on the Android binding, only a fill percentage of
 * THIS window, so it is what turns that percentage back into seconds. Must match
 * `--network-caching` in the module's `VLC_ARGS` (VlcPlayerView.kt). */
export const VLC_CACHE_MS = 1500;

/** libVLC's media counters, as the plane reports them on each time tick.
 * `inputBitrate` is megabytes per second, which is what libVLC hands over. */
export interface VlcPlaneStats {
  lostPictures: number;
  displayedPictures: number;
  inputBitrate: number;
}

export interface VlcPlaneProps {
  sourceUri?: string;
  startMs?: number;
  paused?: boolean;
  /** Seek target, acted on only when `seekNonce` changes. */
  seekMs?: number;
  seekNonce?: number;
  audioTrack?: number;
  audioFilter?: string;
  rate?: number;
  style?: unknown;
  accessibilityLabel?: string;
  onPlayerTime?: (e: {
    nativeEvent: { timeMs: number; lengthMs: number } & Partial<VlcPlaneStats>;
  }) => void;
  onPlayerLoad?: (e: { nativeEvent: { lengthMs: number } }) => void;
  onPlayerState?: (e: { nativeEvent: { state: string; percent?: number } }) => void;
  onPlayerError?: (e: { nativeEvent: { message: string } }) => void;
}

/** Immutable platform capability; different shells never overwrite each other. */
export function vlcBackendFor(
  component: ComponentType<VlcPlaneProps> | null,
  releaseNow: () => void = () => {},
) {
  return Object.freeze({
    getVlcPlane: () => component,
    vlcAvailable: () => component !== null,
    releaseVlcPlanes: releaseNow,
  });
}
