// The libVLC plane is a native view that only the Android shell builds, so it is
// registered rather than imported: @kroma/tv must not reach into clients/.
// Registered nowhere (Apple, Tizen, webOS, the browser), `vlcAvailable()` is
// false and the engine never appears in the picker.

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

let plane: ComponentType<VlcPlaneProps> | null = null;
let release: (() => void) | null = null;

/** Call once at the app root, before the first render; null unregisters. The
 * `releaseNow` half tears every libVLC core down without waiting for React to
 * unmount the view, which is what keeps two engines off the box at once. */
export function registerVlcPlane(
  component: ComponentType<VlcPlaneProps> | null,
  releaseNow?: () => void,
): void {
  plane = component;
  release = releaseNow ?? null;
}

/** Release the native player immediately; a no-op where nothing registered one. */
export function releaseVlcPlanes(): void {
  release?.();
}

export function getVlcPlane(): ComponentType<VlcPlaneProps> | null {
  return plane;
}

/** Whether this shell can offer the VLC engine at all. */
export function vlcAvailable(): boolean {
  return plane != null;
}
