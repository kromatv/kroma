import type { MediaItem } from '@kroma/client';
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
