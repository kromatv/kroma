import type { MediaItem } from '@kroma/client';
import type { MessageKey, TVars } from '../i18n';
import {
  type AudioCapabilities,
  capabilities,
  type FrameSize,
  type PlaybackCapabilities,
} from './capabilities';

export interface DirectPlayVerdict {
  canDirectPlay: boolean;
  messageKey: MessageKey;
  messageVars?: TVars;
  /** A second line, where knowing WHY leaves the viewer with something to do
   * about it. Shares `messageVars` with the line above. */
  hintKey?: MessageKey;
}

/** A picture larger than the decoder that would have to draw it. */
export interface FrameOverrun {
  frame: FrameSize;
  limit: FrameSize;
}

/**
 * The decoder ceiling this item's picture is over, or null when it fits or the
 * device never declared one. Distinct from every other reason a title will not
 * direct-play, because it is the one no fallback answers: another engine decodes
 * the same frame, and the server only repackages it. The picture has to shrink,
 * which nothing on the playback path does.
 */
export function beyondDecoder(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): FrameOverrun | null {
  const video = item.video;
  const limit = caps.frameLimits?.[video?.codec ?? ''];
  if (!limit || video?.width == null || video.height == null) return null;
  const frame = { width: video.width, height: video.height };
  return frame.width > limit.width || frame.height > limit.height ? { frame, limit } : null;
}

// The names a viewer knows a picture by, largest first, each with the frame it
// stands for. One table, read two ways: a FRAME is named by the first tier it
// reaches, a CEILING by the first that fits inside it.
const TIERS: ReadonlyArray<readonly [string, FrameSize]> = [
  ['4K', { width: 3840, height: 2160 }],
  ['1440p', { width: 2560, height: 1440 }],
  ['1080p', { width: 1920, height: 1080 }],
  ['720p', { width: 1280, height: 720 }],
] as const;

const SMALLEST = '480p';

const H264 = 'h264';

/**
 * How a picture reads to a viewer: the tier the catalogue already names it by.
 * Its LARGER axis decides, because a 3840x1604 scope frame is 4K at 1604 rows.
 */
export function frameLabel({ width, height }: FrameSize): string {
  const tier = TIERS.find(([, at]) => width >= at.width || height >= at.height);
  return tier?.[0] ?? SMALLEST;
}

/**
 * How a decoder's ceiling reads: the largest picture that fits INSIDE it, which
 * is not the same question. A decoder declaring 1920x1920 is a 1080p decoder,
 * not a 1440p one - nothing 1440p wide fits in 1920 columns.
 */
export function ceilingLabel({ width, height }: FrameSize): string {
  const tier = TIERS.find(([, at]) => at.width <= width && at.height <= height);
  return tier?.[0] ?? SMALLEST;
}

/**
 * The largest picture a master may deliver to this device, or undefined where it
 * declared no ceiling. What a client sends the server as `maxFrame`: a bigger
 * source is fitted inside the nearest rung under it, which is the one thing no
 * player does for itself.
 *
 * A master arrives as a copy of `item`'s own codec or as the H.264 re-encode, so
 * the ceiling that holds for both is the SMALLER of the two decoders. Taking the
 * largest across every codec is what lets a device whose H.264 decoder stops
 * below its HEVC one be handed a copy it has just refused.
 */
export function decoderMaxFrame(
  item?: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): FrameSize | undefined {
  const limits = caps.frameLimits;
  if (!limits) return undefined;
  const source = item?.video?.codec;
  const reachable = [limits[H264], source ? limits[source] : undefined].filter(
    (l) => l !== undefined,
  );
  if (reachable.length === 0) return undefined;
  return {
    width: Math.min(...reachable.map((l) => l.width)),
    height: Math.min(...reachable.map((l) => l.height)),
  };
}

/**
 * How an overrun reads to a viewer: the tier the picture is in, and the tier the
 * decoder stops at. The two tables answer different questions, so they can land
 * on the same name for a frame that genuinely does not fit: a 2048x858 scope
 * print is 1080p, and so is the 1920x1920 decoder it overruns on width. The
 * frame gives its own size there, because a sentence naming one tier twice tells
 * the viewer nothing.
 */
export function overrunLabels({ frame, limit }: FrameOverrun): {
  source: string;
  ceiling: string;
} {
  const ceiling = ceilingLabel(limit);
  const source = frameLabel(frame);
  return { source: source === ceiling ? `${frame.width}x${frame.height}` : source, ceiling };
}

// Every codec this device cannot decode ends the same way for a viewer, so they
// share the line that says what to do about it. The headline stays per-codec
// because the browser shows it alone, with no room for a second line.
function undecodable(messageKey: MessageKey): DirectPlayVerdict {
  return { canDirectPlay: false, messageKey, hintKey: 'player.codecUnsupportedHint' };
}

export function canDirectPlay(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): DirectPlayVerdict {
  const codec = item.video?.codec ?? 'unknown';
  const tenBit = (item.video?.bitDepth ?? 8) >= 10;

  const over = beyondDecoder(item, caps);
  if (over)
    return {
      canDirectPlay: false,
      messageKey: 'player.frameTooLarge',
      messageVars: overrunLabels(over),
      hintKey: 'player.frameTooLargeHint',
    };

  switch (codec) {
    case 'hevc':
      if (!caps.hevc) return undecodable('player.hevcUnsupported');
      if (tenBit && !caps.hevc10bit) return undecodable('player.hevc10Unsupported');
      return { canDirectPlay: true, messageKey: 'player.directPlayHevc' };
    case 'h264':
      return caps.h264
        ? { canDirectPlay: true, messageKey: 'player.directPlayH264' }
        : undecodable('player.h264Unsupported');
    case 'av1':
      return caps.av1
        ? { canDirectPlay: true, messageKey: 'player.directPlayAv1' }
        : undecodable('player.av1Unsupported');
    case 'vp9':
      return caps.vp9
        ? { canDirectPlay: true, messageKey: 'player.directPlayVp9' }
        : undecodable('player.vp9Unsupported');
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
