// Shared vocabulary of the mobile playback engine: what the UI sees, and the
// mutable core the engine drives behind it.

import type { AudioTrack, VideoPlayer } from 'expo-video';

export type AudioFilterMode = 'off' | 'standard' | 'night';

/** In master mode, a native seek beyond this many seconds ahead is assumed past
 * the remux's production edge, so we re-anchor instead of stalling. */
export const NATIVE_SEEK_AHEAD = 60;

export interface EngineState {
  cur: number;
  dur: number;
  buffered: number;
  playing: boolean;
  waiting: boolean;
  ready: boolean;
  failed: boolean;
  endedNonce: number;
  mode: 'direct' | 'master';
  audioIndex: number;
  filter: AudioFilterMode;
}

export interface Engine extends EngineState {
  player: VideoPlayer;
  /** True when playing a downloaded local file: no server, so audio switches
   * ride the native player's track selection and server DSP is unavailable. */
  offline: boolean;
  /** Native audio tracks of the local file (offline only; empty online). The
   * offline picker lists THESE - what the file actually contains - and
   * `setAudio` takes an ordinal into this list. */
  localAudio: AudioTrack[];
  togglePlay(): void;
  seekTo(abs: number): void;
  skip(delta: number): void;
  setAudio(index: number): void;
  setFilter(mode: AudioFilterMode): void;
  setRate(rate: number): void;
  rate: number;
  /** Kill playback NOW (mute + pause + detach source). Idempotent; called from
   * every exit path rather than trusting unmount timing. */
  shutdown(): void;
}

/** The engine's mutable state. Held in a ref, not in React state: the event
 * handlers read and write it many times per second, and none of it may trigger
 * a render on its own. */
export interface EngineCore {
  mode: 'direct' | 'master';
  baseSec: number;
  elSec: number;
  bufSec: number;
  fellBack: boolean;
  forceAac: boolean;
  resumeOnLoad: boolean;
  pendingSeek: number | null;
  audioIndex: number;
  filter: AudioFilterMode;
  loadId: number;
  /** Set once the current source has actually produced playback time. Guards
   * the end-of-playback path against ExoPlayer's spurious ENDED. */
  started: boolean;
}

/** Stable identity for a native audio track (`id` exists on Android only). */
export function nativeTrackKey(t: AudioTrack): string {
  return t.id ?? `${t.language}|${t.label}`;
}

/** The master's clock starts at the real keyframe the remux began on, which can
 * sit before the requested anchor; the server reports it so the absolute clock
 * stays honest. */
export async function resolveMasterStart(url: string, requested: number): Promise<number> {
  if (requested <= 0.5) return 0;
  try {
    const r = await fetch(url);
    const real = Number(r.headers.get('X-Hls-Start'));
    return Number.isFinite(real) ? real : requested;
  } catch {
    return requested;
  }
}
