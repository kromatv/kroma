import type { AudioCapabilities, HdrCapabilities, PlaybackCapabilities } from './capabilities';

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

// Chromium draws an HDR10 or HLG picture on a wide display but has no Dolby
// Vision decoder, so a profile-5 stream arrives with the wrong colours.
const MSE_HDR: HdrCapabilities = {
  hdr10: true,
  hdr10Plus: false,
  dolbyVision: false,
  hlg: true,
};

/** Chromium MSE (hls.js on Chrome/Firefox/webOS): no AC3/EAC3/DTS audio, so
 * those masters must be AAC. */
export const MSE_CAPS: PlaybackCapabilities = {
  hevc: true,
  hevc10bit: true,
  h264: true,
  h26410bit: false,
  av1: true,
  vp9: true,
  hdr: MSE_HDR,
  audio: MSE_AUDIO,
  source: 'mediaSource',
};

/** Safari native HLS: AC3/EAC3 decode natively, so surround masters can be
 * stream-copied, and Apple's video stack decodes Dolby Vision. AV1 in Safari /
 * WKWebView is hardware-only (Apple Silicon M3+) with no software fallback, hence
 * `av1: false`; mpv is the AV1 path there. */
export const SAFARI_CAPS: PlaybackCapabilities = {
  ...MSE_CAPS,
  av1: false,
  hdr: { ...MSE_HDR, dolbyVision: true },
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
 * everything its silicon has a block for, which for H.264 is 8-bit 4:2:0 alone. */
export const NATIVE_TV_CAPS: PlaybackCapabilities = {
  hevc: true,
  hevc10bit: true,
  h264: true,
  h26410bit: false,
  av1: false,
  vp9: true,
  hdr: { hdr10: true, hdr10Plus: true, dolbyVision: true, hlg: true },
  audio: TV_AUDIO,
  source: 'platform-tv',
};

// Measured on a Tizen 9.0 set (AVPlay, HLS fMP4): AAC, AC-3, E-AC-3 and MPEG
// audio prepare and play, while FLAC, DTS and TrueHD fail `prepareAsync` outright
// and Opus prepares with a zero-channel track. The same silicon reads all of them
// out of a file, which is why this is not NATIVE_TV_CAPS.
const AVPLAY_HLS_AUDIO: AudioCapabilities = {
  aac: true,
  ac3: true,
  eac3: true,
  dts: false,
  truehd: false,
  flac: false,
  opus: false,
  mp3: true,
  vorbis: false,
};

/** Samsung AVPlay reading the server's HLS master: a narrower set than the same
 * TV's direct play of a file, so anything outside this table must reach the set
 * as AAC. */
export const AVPLAY_HLS_CAPS: PlaybackCapabilities = {
  ...NATIVE_TV_CAPS,
  audio: AVPLAY_HLS_AUDIO,
};

/** mpv on the desktop shell: ffmpeg's own decoders behind whatever the box
 * accelerates, so a profile no silicon takes falls to software rather than to a
 * black picture. */
export const MPV_CAPS: PlaybackCapabilities = {
  ...NATIVE_TV_CAPS,
  h26410bit: true,
  av1: true,
  source: 'unknown',
};
