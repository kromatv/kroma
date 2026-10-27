// Shared vocabulary of the mobile playback engine: what the UI sees, and the
// mutable core the engine drives behind it.

import type { AudioTrack, VideoPlayer } from 'expo-video';
import type { PlaybackFailure } from '../playback-failure';

// Deliberately NOT the kit's `AudioFilterMode`, and narrower than it: the phone
// applies the filter through the server's remux, so it can only offer the modes the
// server has. The kit's `boost` is client-side gain and has no server token. Adding
// a mode to the kit therefore does NOT reach here - wire it explicitly, or it is
// silently absent on the phone.
export type AudioFilterMode = 'off' | 'standard' | 'night';

// In master mode, a native seek beyond this many seconds ahead is assumed
// past the remux's production edge, so it re-anchors instead of stalling.
export const NATIVE_SEEK_AHEAD = 60;

export interface EngineState {
  cur: number;
  dur: number;
  buffered: number;
  playing: boolean;
  waiting: boolean;
  ready: boolean;
  failed: boolean;
  failure?: PlaybackFailure | null;
  endedNonce: number;
  mode: 'direct' | 'master';
  audioIndex: number;
  filter: AudioFilterMode;
}

export interface Engine extends EngineState {
  player: VideoPlayer;
  // True when playing a downloaded local file: no server, so audio switches
  // ride the native player's track selection, and server DSP is unavailable.
  offline: boolean;
  // Local file's native tracks (offline only; empty online). The offline
  // picker lists these, and `setAudio`'s index is an ordinal into this list.
  localAudio: AudioTrack[];
  togglePlay(): void;
  seekTo(abs: number): void;
  skip(delta: number): void;
  setAudio(index: number): void;
  setFilter(mode: AudioFilterMode): void;
  setRate(rate: number): void;
  rate: number;
  // Idempotent; called from every exit path rather than trusting unmount timing.
  shutdown(): void;
}

/** The engine's mutable state. Held in a ref, not in React state: the event
 * handlers read and write it many times per second, and none of it may trigger
 * a render on its own. */
export interface EngineCore {
  active: boolean;
  terminal: boolean;
  sourceUri: string | null;
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
  subtitle: string | null;
  // Guards the end-of-playback path against ExoPlayer's spurious ENDED.
  started: boolean;
}

/** Stable identity for a native audio track, including same-language variants. */
export function nativeTrackKey(t: AudioTrack): string {
  return t.id ?? `${t.language}|${t.label}`;
}

export function patchCore(core: EngineCore, patch: Partial<EngineCore>): void {
  Object.assign(core, patch);
}

export function nextLoadId(core: EngineCore): number {
  core.loadId += 1;
  return core.loadId;
}

export function patchPlayer(
  player: VideoPlayer,
  patch: Partial<
    Pick<VideoPlayer, 'muted' | 'currentTime' | 'audioTrack' | 'subtitleTrack' | 'playbackRate'>
  >,
): void {
  Object.assign(player, patch);
}
