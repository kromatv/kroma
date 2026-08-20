import type { MediaItem } from '@kroma/client';
import { audioTracksOf, canDecodeAudioCodec, masterNeedsAac } from './audio-support';
import type { PlaybackCapabilities } from './capabilities';
import { canDirectPlay, MSE_CAPS, NATIVE_TV_CAPS, SAFARI_CAPS } from './directplay';

export type PlayerEngineKind = 'direct' | 'web-mse' | 'tizen-avplay' | 'webos' | 'desktop-mpv';

export interface PlayEnv {
  platform: 'web' | 'tizen' | 'webos' | 'desktop';
  safari: boolean;
  runtimeCaps?: PlaybackCapabilities;
  // Legacy webOS (Chromium < 99) cannot decode HEVC through MSE but plays the
  // master natively; prefer the platform's HLS pipeline over MSE/hls.js there.
  nativeHls?: boolean;
}

export interface EngineDecision {
  kind: PlayerEngineKind;
  aacMaster: boolean;
}

const MP4_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'm4a', 'isom']);

function plainCompatibleMp4(item: MediaItem, caps: PlaybackCapabilities): boolean {
  const container = (item.container ?? '').toLowerCase();
  if (!MP4_CONTAINERS.has(container)) return false;
  if (!canDirectPlay(item, caps).canDirectPlay) return false;
  const tracks = audioTracksOf(item);
  if (tracks.length !== 1) return false;
  const def = tracks.find((t) => t.default) ?? tracks[0];
  return canDecodeAudioCodec(def?.codec, caps);
}

// Containers Samsung AVPlay demuxes natively from a plain HTTP(S) URL with
// Range support.
const AVPLAY_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'mkv', 'webm', 'ts', 'm2ts']);

/** Whether Tizen's native AVPlay can play the ORIGINAL file with no server
 * remux. Audio is not a gate; the engine falls back to the HLS master on a real
 * playback error. */
export function avplayDirectPlayable(item: MediaItem): boolean {
  const container = (item.container ?? '').toLowerCase();
  if (!AVPLAY_CONTAINERS.has(container)) return false;
  return canDirectPlay(item, NATIVE_TV_CAPS).canDirectPlay;
}

// AVFoundation demuxes the QuickTime/MP4 family and nothing else: no Matroska,
// no WebM, no MPEG-TS, and no framework flag turns one on.
const APPLE_CONTAINERS = new Set(['mp4', 'mov', 'm4v']);

const MEDIA3_CONTAINERS = AVPLAY_CONTAINERS;

/**
 * Whether the native clients (AVPlayer on Apple TV, Media3 on Android TV) can
 * open the ORIGINAL file rather than the server's remux. Split by platform
 * because container support is where the two players differ.
 */
export function nativeDirectPlayable(item: MediaItem, os: 'ios' | 'android'): boolean {
  const container = (item.container ?? '').toLowerCase();
  const containers = os === 'ios' ? APPLE_CONTAINERS : MEDIA3_CONTAINERS;
  if (!containers.has(container)) return false;
  return canDirectPlay(item, NATIVE_TV_CAPS).canDirectPlay;
}

/**
 * Pick the playback engine and master variant for an item in an environment.
 * Engines that keep a direct→master error fallback (mpv, AVPlay, bare `<video>`)
 * may be chosen optimistically.
 */
export function selectEngine(item: MediaItem, env: PlayEnv): EngineDecision {
  if (env.platform === 'desktop') {
    return { kind: 'desktop-mpv', aacMaster: false };
  }
  if (env.platform === 'tizen') {
    return { kind: 'tizen-avplay', aacMaster: false };
  }
  if (env.platform === 'webos') {
    if (plainCompatibleMp4(item, NATIVE_TV_CAPS)) return { kind: 'direct', aacMaster: false };
    // The webOS MSE/hls.js path cannot decode AC3/EAC3; the TV's native pipeline can.
    return { kind: 'webos', aacMaster: !env.nativeHls };
  }
  const caps = env.safari ? SAFARI_CAPS : MSE_CAPS;
  // Prefer the probed runtime over the static table: modern Chromium
  // hardware-decodes HEVC in a bare `<video>` where available.
  if (plainCompatibleMp4(item, env.runtimeCaps ?? caps))
    return { kind: 'direct', aacMaster: false };
  return { kind: 'web-mse', aacMaster: masterNeedsAac(item, caps) };
}
