// The libVLC plane is a native view that only the Android shell builds, so it is
// registered rather than imported: @kroma/tv must not reach into clients/.
// Registered nowhere (Apple, Tizen, webOS, the browser), `vlcAvailable()` is
// false and the engine never appears in the picker.

import type { ComponentType } from 'react';

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
  onPlayerTime?: (e: { nativeEvent: { timeMs: number; lengthMs: number } }) => void;
  onPlayerLoad?: (e: { nativeEvent: { lengthMs: number } }) => void;
  onPlayerState?: (e: { nativeEvent: { state: string; percent?: number } }) => void;
  onPlayerError?: (e: { nativeEvent: { message: string } }) => void;
}

let plane: ComponentType<VlcPlaneProps> | null = null;

/** Call once at the app root, before the first render; null unregisters. */
export function registerVlcPlane(component: ComponentType<VlcPlaneProps> | null): void {
  plane = component;
}

export function getVlcPlane(): ComponentType<VlcPlaneProps> | null {
  return plane;
}

/** Whether this shell can offer the VLC engine at all. */
export function vlcAvailable(): boolean {
  return plane != null;
}
