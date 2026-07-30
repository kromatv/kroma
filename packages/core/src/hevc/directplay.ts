import type { AudioTrack, MediaItem } from '@kroma/client';
import type { MessageKey, TVars } from '../i18n';
import { type AudioCapabilities, capabilities, type PlaybackCapabilities } from './capabilities';

export interface DirectPlayVerdict {
  canDirectPlay: boolean;
  messageKey: MessageKey;
  messageVars?: TVars;
}

export function canDirectPlay(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): DirectPlayVerdict {
  const codec = item.video?.codec ?? 'unknown';
  const tenBit = (item.video?.bitDepth ?? 8) >= 10;

  switch (codec) {
    case 'hevc':
      if (!caps.hevc) return { canDirectPlay: false, messageKey: 'player.hevcUnsupported' };
      if (tenBit && !caps.hevc10bit)
        return { canDirectPlay: false, messageKey: 'player.hevc10Unsupported' };
      return { canDirectPlay: true, messageKey: 'player.directPlayHevc' };
    case 'h264':
      return caps.h264
        ? { canDirectPlay: true, messageKey: 'player.directPlayH264' }
        : { canDirectPlay: false, messageKey: 'player.h264Unsupported' };
    case 'av1':
      return caps.av1
        ? { canDirectPlay: true, messageKey: 'player.directPlayAv1' }
        : { canDirectPlay: false, messageKey: 'player.av1Unsupported' };
    case 'vp9':
      return caps.vp9
        ? { canDirectPlay: true, messageKey: 'player.directPlayVp9' }
        : { canDirectPlay: false, messageKey: 'player.vp9Unsupported' };
    default:
      return { canDirectPlay: true, messageKey: 'player.directPlayUnknown' };
  }
}

/** Browsers cannot decode AC3/EAC3/DTS/TrueHD, which plays as video with no
 * sound; `messageKey` is null when audio plays fine. */
export interface AudioSupport {
  canPlay: boolean;
  messageKey: MessageKey | null;
  messageVars?: TVars;
}

export function audioSupport(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): AudioSupport {
  const codec = item.audio?.codec;
  if (!codec) return { canPlay: true, messageKey: null };
  const ok = (caps.audio as unknown as Record<string, boolean | undefined>)[codec];
  if (ok === undefined || ok) return { canPlay: true, messageKey: null }; // unknown codec → don't block
  return {
    canPlay: false,
    messageKey: 'player.audioUnsupported',
    messageVars: { codec: codec.toUpperCase() },
  };
}

/** Audio codecs ffmpeg can stream-copy into the fMP4 HLS variant, preserving
 * surround; others (DTS/TrueHD/FLAC/Opus) fall back to a stereo-AAC transcode. */
export const FMP4_COPY_CODECS = new Set<string>(['aac', 'ac3', 'eac3']);

/** Falls back to a single track for older payloads that only carry the
 * representative `audio`. */
export function audioTracksOf(item: MediaItem): AudioTrack[] {
  if (item.audioTracks?.length) return item.audioTracks;
  return item.audio ? [{ ...item.audio, index: item.audio.index ?? 0 }] : [];
}

/** Unknown codecs are assumed decodable. */
export function canDecodeAudioCodec(
  codec: string | undefined,
  caps: PlaybackCapabilities = capabilities(),
): boolean {
  if (!codec) return true;
  const ok = (caps.audio as unknown as Record<string, boolean | undefined>)[codec];
  return ok === undefined || ok;
}

/** Whether the single-stream HLS master can carry every audio track as an
 * alternate rendition, making language switches in-place. */
export function canSeamlessAudioSwitch(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): boolean {
  if (!canDirectPlay(item, caps).canDirectPlay) return false;
  return audioTracksOf(item).length > 1;
}

/**
 * For a master stream, whether audio must be transcoded to stereo AAC (true) or
 * can be stream-copied (false). Copy preserves surround and needs EVERY track to
 * be natively decodable and fMP4-copy-safe here. Unprobed audio must be AAC:
 * stream-copying a codec the browser cannot decode stalls the load on
 * `HAVE_NOTHING`.
 */
export function masterNeedsAac(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): boolean {
  const tracks = audioTracksOf(item);
  if (tracks.length === 0) return true;
  return !tracks.every(
    (t) => !!t.codec && canDecodeAudioCodec(t.codec, caps) && FMP4_COPY_CODECS.has(t.codec),
  );
}

/**
 * Track selection must key off this, never the array order: the server can serve
 * `item.audioTracks` in a different order than the player last saw.
 */
export interface AudioTrackId {
  index: number;
  language: string | null;
  title: string | null;
  channels: number | null;
}

export function audioTrackId(t: AudioTrack): AudioTrackId {
  return {
    index: t.index,
    language: t.language ?? null,
    title: t.title ?? null,
    channels: t.channels ?? null,
  };
}

function sameIdentity(t: AudioTrack, want: AudioTrackId): boolean {
  return (
    (t.language ?? null) === want.language &&
    (t.title ?? null) === want.title &&
    (t.channels ?? null) === want.channels
  );
}

function scoreMatch(t: AudioTrack, want: AudioTrackId): number {
  let s = 0;
  const lang = t.language ?? null;
  if (want.language != null && lang != null) {
    if (lang.toLowerCase() === want.language.toLowerCase()) s += 100;
  } else if (want.language == null && lang == null) {
    s += 20;
  }
  if (want.channels != null && t.channels != null && t.channels === want.channels) s += 10;
  const tt = (t.title ?? '').trim().toLowerCase();
  const wt = (want.title ?? '').trim().toLowerCase();
  if (wt && tt && tt === wt) s += 5;
  return s;
}

/**
 * Resolve a wanted audio identity to the audio-relative index to select (what
 * `hls.audioTrack` / a Safari `video.audioTracks` slot expects), tolerating a
 * reordered track list.
 */
export function resolveAudioRelativeIndex(tracks: AudioTrack[], want: AudioTrackId): number {
  if (tracks.length === 0) return 0;

  const exact = tracks.find((t) => t.index === want.index);
  if (exact && sameIdentity(exact, want)) return exact.index;

  let best: AudioTrack | null = null;
  let bestScore = 0;
  for (const t of tracks) {
    const s = scoreMatch(t, want);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  if (best) return best.index;

  const def = tracks.find((t) => t.default);
  return def?.index ?? tracks[0]?.index ?? 0;
}

const MSE_AUDIO: AudioCapabilities = {
  aac: true,
  ac3: false, // Chromium/webOS MSE cannot decode AC3/EAC3/DTS
  eac3: false,
  dts: false,
  truehd: false,
  flac: true,
  opus: true,
  mp3: true,
  vorbis: true,
};

/** Chromium MSE (hls.js on Chrome/Firefox/webOS): no AC3/EAC3/DTS audio, so
 * those masters must be AAC. */
export const MSE_CAPS: PlaybackCapabilities = {
  hevc: true,
  hevc10bit: true,
  h264: true,
  av1: true,
  vp9: true,
  hdr: false,
  audio: MSE_AUDIO,
  source: 'mediaSource',
};

/** Safari native HLS: AC3/EAC3 decode natively, so surround masters can be
 * stream-copied. AV1 in Safari / WKWebView is hardware-only (Apple Silicon M3+)
 * with no software fallback, hence `av1: false`; mpv is the AV1 path there. */
export const SAFARI_CAPS: PlaybackCapabilities = {
  ...MSE_CAPS,
  av1: false,
  audio: { ...MSE_AUDIO, ac3: true, eac3: true },
  source: 'videoElement',
};

const TV_AUDIO: AudioCapabilities = {
  aac: true,
  ac3: true,
  eac3: true,
  dts: true,
  truehd: true,
  flac: true,
  opus: true,
  mp3: true,
  vorbis: true,
};

/** Native TV decoder (AVPlay / native `<video>` on Tizen/webOS): decodes
 * everything, so masters can be stream-copied. */
export const NATIVE_TV_CAPS: PlaybackCapabilities = {
  hevc: true,
  hevc10bit: true,
  h264: true,
  av1: false,
  vp9: true,
  hdr: true,
  audio: TV_AUDIO,
  source: 'platform-tv',
};

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
