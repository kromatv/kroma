// Codec/capability probing: what video + audio the *current runtime* can decode.

import { isTizenRuntime, isWebOsRuntime } from '../platform';

// `hvc1`/`hev1` are the two HEVC sample entry fourCCs; both are probed because
// platforms disagree on which they accept.
const PROBE = {
  hevcMain: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  hevcMainAlt: 'video/mp4; codecs="hev1.1.6.L93.B0"',
  hevcMain10: 'video/mp4; codecs="hvc1.2.4.L120.B0"',
  h264High: 'video/mp4; codecs="avc1.640028"',
  av1Main: 'video/mp4; codecs="av01.0.05M.08"',
  vp9: 'video/webm; codecs="vp09.00.10.08"',
} as const;

// AC3/EAC3/DTS/TrueHD are not decodable by Chrome/Firefox (licensing); only
// Safari (macOS) and TVs handle AC3/EAC3.
const AUDIO_PROBE = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
  flac: 'audio/ogg; codecs="flac"',
  opus: 'audio/webm; codecs="opus"',
  mp3: 'audio/mpeg',
  vorbis: 'audio/webm; codecs="vorbis"',
} as const;

export interface AudioCapabilities {
  aac: boolean;
  ac3: boolean;
  eac3: boolean;
  dts: boolean;
  truehd: boolean;
  flac: boolean;
  opus: boolean;
  mp3: boolean;
  vorbis: boolean;
}

export interface PlaybackCapabilities {
  hevc: boolean;
  hevc10bit: boolean;
  h264: boolean;
  av1: boolean;
  vp9: boolean;
  hdr: boolean;
  audio: AudioCapabilities;
  source: 'mediaSource' | 'videoElement' | 'platform-tv' | 'unknown';
}

function supportsType(type: string): boolean {
  const MS = (globalThis as { MediaSource?: { isTypeSupported(t: string): boolean } }).MediaSource;
  if (MS && typeof MS.isTypeSupported === 'function' && MS.isTypeSupported(type)) return true;

  if (typeof document !== 'undefined') {
    const v = document.createElement('video');
    const r = v.canPlayType(type);
    if (r === 'probably' || r === 'maybe') return true;
  }
  return false;
}

function detectHdr(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return (
    globalThis.matchMedia('(dynamic-range: high)').matches ||
    globalThis.matchMedia('(video-dynamic-range: high)').matches
  );
}

// The native clients decode through the platform, not a `<video>` element:
// React Native has neither `canPlayType` nor `MediaSource`, so every probe
// below answers "no". `navigator.product`, not `typeof document`: a server-side
// render has no document either and must fall through to the browser answer it
// will hydrate into.
function isReactNative(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

export function detectCapabilities(): PlaybackCapabilities {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isTizen = isTizenRuntime(ua);
  const isWebOS = isWebOsRuntime(ua);
  if (isTizen || isWebOS || isReactNative()) {
    const tvAudio: AudioCapabilities = {
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
    return {
      hevc: true,
      hevc10bit: true,
      h264: true,
      av1: false,
      vp9: true,
      hdr: true,
      audio: tvAudio,
      source: 'platform-tv',
    };
  }

  const hevc = supportsType(PROBE.hevcMain) || supportsType(PROBE.hevcMainAlt);
  const usingMse = !!(globalThis as { MediaSource?: unknown }).MediaSource;
  const audio: AudioCapabilities = {
    aac: supportsType(AUDIO_PROBE.aac),
    ac3: supportsType(AUDIO_PROBE.ac3),
    eac3: supportsType(AUDIO_PROBE.eac3),
    dts: false, // never decodable in a browser
    truehd: false,
    flac: supportsType(AUDIO_PROBE.flac) || supportsType('audio/mp4; codecs="fLaC"'),
    opus: supportsType(AUDIO_PROBE.opus),
    mp3: supportsType(AUDIO_PROBE.mp3),
    vorbis: supportsType(AUDIO_PROBE.vorbis),
  };
  return {
    hevc,
    hevc10bit: supportsType(PROBE.hevcMain10),
    h264: supportsType(PROBE.h264High),
    av1: supportsType(PROBE.av1Main),
    vp9: supportsType(PROBE.vp9),
    hdr: detectHdr(),
    audio,
    source: usingMse ? 'mediaSource' : 'videoElement',
  };
}

let cached: PlaybackCapabilities | null = null;
/** Cached: capabilities cannot change within a session. */
export function capabilities(): PlaybackCapabilities {
  cached ??= detectCapabilities();
  return cached;
}
